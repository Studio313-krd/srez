from datetime import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone


def valid_timezone(value):
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValidationError('Укажите часовой пояс IANA, например Europe/Moscow.')


def valid_weekdays(value):
    if not isinstance(value, list) or any(type(i) is not int or i not in range(7) for i in value):
        raise ValidationError('Дни недели: список чисел 0–6 (понедельник–воскресенье).')


def all_weekdays():
    return list(range(7))


class Store(models.Model):
    code = models.CharField('Постоянный код', max_length=32, unique=True)
    name = models.CharField('Адрес / название', max_length=200)
    city = models.CharField('Город', max_length=100)
    network = models.CharField('Сеть', max_length=2, choices=[('MM', 'Мильстрим'), ('KK', 'Культура крепкого')])
    timezone = models.CharField('Часовой пояс', max_length=64, default='Europe/Moscow', validators=[valid_timezone])
    opens_at = models.TimeField('Открытие', default=time(10))
    closes_at = models.TimeField('Закрытие', default=time(22))
    weekdays = models.JSONField('Рабочие дни (0–6)', default=all_weekdays, validators=[valid_weekdays])
    active_from = models.DateField('Начало работы в сервисе')
    active_until = models.DateField('Последний рабочий день', null=True, blank=True)
    expected_through = models.DateField(null=True, editable=False)
    archived = models.BooleanField(default=False)
    monitoring_enabled = models.BooleanField(default=True)
    profile = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['network', 'code']
        verbose_name = 'магазин'
        verbose_name_plural = 'Магазины'

    def clean(self):
        if self.active_until and self.active_until < self.active_from:
            raise ValidationError('Последний день не может быть раньше первого.')

    def __str__(self):
        return f'{self.code} · {self.city}, {self.name}'


class Access(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='access')
    role = models.CharField('Роль', max_length=16, choices=[('store', 'Магазин'), ('office', 'Видеоконтроль'), ('manager', 'Руководитель')])
    stores = models.ManyToManyField(Store, blank=True, verbose_name='Доступные магазины сотрудника')

    class Meta:
        verbose_name = 'доступ сотрудника'
        verbose_name_plural = 'Доступ сотрудников'

    def __str__(self):
        return str(self.user)


class ScheduleException(models.Model):
    store = models.ForeignKey(Store, on_delete=models.PROTECT)
    date = models.DateField('Рабочая дата')
    closed = models.BooleanField('Выходной', default=False)
    opens_at = models.TimeField('Открытие', null=True, blank=True)
    closes_at = models.TimeField('Закрытие', null=True, blank=True)
    reason = models.CharField('Причина', max_length=300)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['store', 'date'], name='unique_schedule_date')]
        verbose_name = 'исключение графика'
        verbose_name_plural = 'Исключения графика'


class Plan(models.Model):
    store = models.ForeignKey(Store, on_delete=models.PROTECT)
    date = models.DateField('Рабочая дата')
    revenue = models.DecimalField('План выручки', max_digits=14, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    receipts = models.PositiveIntegerField('План чеков (необязательно)', null=True, blank=True)
    units = models.PositiveIntegerField('План алкогольных единиц', null=True, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, editable=False)
    approved_at = models.DateTimeField(auto_now_add=True)
    reason = models.CharField('Основание / причина изменения', max_length=300, blank=True)
    origin = models.CharField(max_length=16, default='manual')
    units_per_receipt = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    source_data = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-approved_at', '-pk']
        verbose_name = 'утверждённая версия плана'
        verbose_name_plural = 'Версии планов'


class Report(models.Model):
    store = models.ForeignKey(Store, on_delete=models.PROTECT)
    date = models.DateField()
    checkpoint = models.CharField(max_length=5, choices=[('13', '13:00'), ('17', '17:00'), ('close', 'Закрытие')])
    available_at = models.DateTimeField(null=True, blank=True)
    deadline = models.DateTimeField(null=True, blank=True)
    imported = models.BooleanField(default=False)
    source_data = models.JSONField(default=dict, blank=True)
    first_received_at = models.DateTimeField(null=True, blank=True)
    current_version = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['store', 'date', 'checkpoint'], name='unique_report')]
        indexes = [models.Index(fields=['date', 'checkpoint'])]


class Revision(models.Model):
    report = models.ForeignKey(Report, on_delete=models.PROTECT, related_name='revisions')
    version = models.PositiveIntegerField()
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    received_at = models.DateTimeField(default=timezone.now, null=True, blank=True)
    revenue = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    receipts = models.PositiveIntegerField(null=True, blank=True)
    units = models.PositiveIntegerField(null=True, blank=True)
    origin = models.CharField(max_length=16, default='manual')
    employee = models.CharField(max_length=200, blank=True)
    imported_at = models.DateTimeField(null=True, blank=True)
    source_data = models.JSONField(default=dict, blank=True)
    comment = models.TextField(blank=True)
    request_id = models.UUIDField(unique=True)
    payload_hash = models.CharField(max_length=64)

    class Meta:
        ordering = ['version']
        constraints = [models.UniqueConstraint(fields=['report', 'version'], name='unique_revision')]


class Finding(models.Model):
    report = models.ForeignKey(Report, on_delete=models.PROTECT, related_name='findings')
    version = models.PositiveIntegerField()
    kind = models.CharField(max_length=32)
    message = models.CharField(max_length=400)
    state = models.CharField(max_length=16, default='open', choices=[('open', 'Новое'), ('requested', 'Запрошено пояснение'),
        ('accepted', 'Исключение подтверждено'), ('escalated', 'Руководителю'), ('resolved', 'Исправлено')])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['report', 'version', 'kind'], name='unique_finding')]


class FindingAction(models.Model):
    finding = models.ForeignKey(Finding, on_delete=models.PROTECT, related_name='actions')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=16)
    comment = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class Notification(models.Model):
    finding = models.ForeignKey(Finding, on_delete=models.PROTECT)
    channel = models.CharField(max_length=12, default='telegram', choices=[('telegram', 'Telegram'), ('max', 'MAX')])
    event_key = models.CharField(max_length=40, default='created')
    action = models.ForeignKey(FindingAction, on_delete=models.PROTECT, null=True, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    next_attempt_at = models.DateTimeField()
    sent_at = models.DateTimeField(null=True)
    last_error = models.CharField(max_length=120, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['finding', 'channel', 'event_key'], name='unique_notification_event')]


class NotificationChannel(models.Model):
    channel = models.CharField(max_length=12, primary_key=True)
    next_send_at = models.DateTimeField(default=timezone.now)


class WorkerHealth(models.Model):
    name = models.CharField(max_length=32, unique=True)
    last_success = models.DateTimeField()


class LoginAttempt(models.Model):
    key = models.CharField(max_length=64, unique=True)
    failures = models.PositiveIntegerField(default=0)
    window_start = models.DateTimeField()


class Employee(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name='employee_profile')
    login_version = models.CharField(max_length=64, blank=True, default='', editable=False)
    name = models.CharField(max_length=200)
    key = models.CharField(max_length=64, unique=True)
    position = models.CharField(max_length=100, default='Продавец')
    active = models.BooleanField(default=True)
    archived = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    source_data = models.JSONField(default=dict, blank=True)


class StoreStaff(models.Model):
    store = models.ForeignKey(Store, on_delete=models.PROTECT, related_name='staff')
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name='assignments')
    slot = models.CharField(max_length=16)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['store', 'slot'], name='unique_store_staff_slot')]


class LegalEntity(models.Model):
    name = models.CharField(max_length=250, unique=True)
    data = models.JSONField(default=dict, blank=True)


class SourceDocument(models.Model):
    key = models.CharField(max_length=100, unique=True)
    title = models.CharField(max_length=250)
    url = models.TextField(blank=True)
    checksum = models.CharField(max_length=64)
    imported_at = models.DateTimeField(default=timezone.now)
    stats = models.JSONField(default=dict, blank=True)


class SourceSheet(models.Model):
    document = models.ForeignKey(SourceDocument, on_delete=models.PROTECT, related_name='sheets')
    title = models.CharField(max_length=200)
    values = models.JSONField(default=list)
    formulas = models.JSONField(default=list)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['document', 'title'], name='unique_source_sheet')]


class ImportIssue(models.Model):
    key = models.CharField(max_length=250, unique=True)
    store = models.ForeignKey(Store, null=True, on_delete=models.PROTECT)
    kind = models.CharField(max_length=40)
    message = models.TextField()
    details = models.JSONField(default=dict)
    resolved = models.BooleanField(default=False)
    resolution = models.TextField(blank=True)


class ManagementEvent(models.Model):
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=100)
    entity = models.CharField(max_length=250)
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
