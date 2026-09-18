"""Reusable employee links. Versions can be revoked without deleting reports."""
from django.core.signing import Signer


def signer():
    return Signer(salt='reports.employee-link.v1')


def access_data(person, include_link=False):
    if not person.user_id:
        return None
    result = {'enabled': person.user.is_active,
              'has_link': bool(person.login_version),
              'store_ids': list(person.user.access.stores.values_list('pk', flat=True))}
    if include_link:
        result['link_path'] = '/#seller=' + signer().sign_object(
            {'id': person.pk, 'version': person.login_version}) if person.login_version else ''
    return result


def disable_employee_login(person):
    if person.user_id:
        user = person.user
        user.is_active = False
        # Invalidate sessions even if access is re-enabled before their next request.
        user.set_unusable_password()
        user.save(update_fields=['is_active', 'password'])
