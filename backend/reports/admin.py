from django.contrib import admin
from django.core.exceptions import ValidationError
from .models import Store, Access, ScheduleException, Plan, Report, Revision, Finding, FindingAction, Notification, WorkerHealth

admin.site.site_header = 'Срез · управление'
admin.site.site_title = 'Срез'


@admin.register(Store)
class StoreAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'city', 'network', 'timezone', 'active_from', 'active_until']
    search_fields = ['code', 'name', 'city']
    list_filter = ['network', 'city']


@admin.register(Access)
class AccessAdmin(admin.ModelAdmin):
    list_display = ['user', 'role']
    list_filter = ['role']
    filter_horizontal = ['stores']


@admin.register(ScheduleException)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = ['store', 'date', 'closed', 'opens_at', 'closes_at', 'reason']
    list_filter = ['date', 'closed']

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        class ScheduleForm(form):
            def clean(self):
                values = super().clean()
                if Report.objects.filter(store=values.get('store'), date=values.get('date')).exists():
                    raise ValidationError('Сроки на этот день уже зафиксированы. Сохраните пояснение в замечании; график меняется для будущих дней.')
                return values
        return ScheduleForm

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ['store', 'date', 'revenue', 'receipts', 'units', 'approved_by', 'approved_at']
    list_filter = ['date', 'store__network']
    readonly_fields = ['approved_by', 'approved_at']

    def has_change_permission(self, request, obj=None):
        return obj is None and super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        obj.approved_by = request.user
        super().save_model(request, obj, form, change)


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


for model in [Report, Revision, Finding, FindingAction, Notification, WorkerHealth]:
    admin.site.register(model, ReadOnlyAdmin)
