import time
from django.core.management.base import BaseCommand
from django.db import close_old_connections
from reports.worker import tick, deliver_notifications


class Command(BaseCommand):
    help = 'Create expected reports, detect deadlines, deliver enabled notifications.'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true')

    def handle(self, *args, **options):
        next_check = 0
        while True:
            try:
                close_old_connections()
                if time.monotonic() >= next_check:
                    tick()
                    next_check = time.monotonic() + 30
                deliver_notifications()
            except Exception as error:
                self.stderr.write(f'Worker failed: {type(error).__name__}')
                if options['once']:
                    raise
            if options['once']:
                return
            time.sleep(1)
