from datetime import timedelta
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from reports.models import WorkerHealth


class Command(BaseCommand):
    def handle(self, *args, **options):
        health = WorkerHealth.objects.filter(name='scheduler').first()
        if not health or timezone.now() - health.last_success > timedelta(minutes=3):
            raise CommandError('Scheduler heartbeat is stale')
        self.stdout.write('ok')
