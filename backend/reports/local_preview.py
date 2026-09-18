"""Role shortcuts for an explicitly enabled loopback-only design preview."""
from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.http import JsonResponse
from django.middleware.csrf import get_token
from .services import DomainError
from .views import endpoint, body, user_json


def require_local_preview(request):
    if not (settings.DEBUG and getattr(settings, 'SREZ_LOCAL_PREVIEW', False)
            and request.META.get('REMOTE_ADDR') in ['127.0.0.1', '::1']
            and request.get_host().split(':')[0] in ['localhost', '127.0.0.1']):
        raise DomainError('Страница не найдена.', 404)


@endpoint(('POST',), authenticated=False)
def enter(request):
    require_local_preview(request)
    account = {'manager': 'test.admin', 'store': 'test.seller'}.get(body(request).get('role'))
    if not account:
        raise DomainError('Выберите роль.')
    user = get_user_model().objects.filter(username=account, is_active=True).first()
    if not user:
        raise DomainError('Локальные учебные аккаунты ещё не созданы.', 409)
    login(request, user)
    return JsonResponse({'user': user_json(user), 'csrf': get_token(request)})


@endpoint(('POST',))
def create_store(request):
    """Create a local practice store using normal validation and auditing."""
    import json
    from django.db import transaction
    from .management_api import require_admin, save_store
    from .models import Access, Store
    require_local_preview(request)
    require_admin(request)
    with transaction.atomic():
        response = save_store(request, 0)
        if response.status_code >= 400:
            return response
        store = Store.objects.get(pk=json.loads(response.content)['id'])
        access = Access.objects.filter(user__username='test.seller', role='store').first()
        if access:
            access.stores.add(store)
        return response
