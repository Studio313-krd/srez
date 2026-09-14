from ipaddress import ip_address, ip_network
from django.conf import settings


class TrustedProxyMiddleware:
    """Only the configured reverse proxy may assert an HTTPS connection."""
    def __init__(self, get_response):
        self.get_response = get_response
        self.networks = [ip_network(value.strip()) for value in settings.TRUSTED_PROXY_CIDRS.split(',') if value.strip()]

    def __call__(self, request):
        if not settings.DEBUG:
            try:
                address = ip_address(request.META.get('REMOTE_ADDR', ''))
                trusted = any(address in network for network in self.networks)
            except ValueError:
                trusted = False
            if not trusted:
                request.META.pop('HTTP_X_FORWARDED_PROTO', None)
                request.META['wsgi.url_scheme'] = 'http'
        return self.get_response(request)
