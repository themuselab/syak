"""RDS-backed request allocation and shared site cooldown for ordinary-shop refreshes."""
import time
from datetime import datetime
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError

from slot_ingest import api_get, api_post


class SourcePaused(RuntimeError):
    pass


def epoch(value):
    return datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()


class SourceBudget:
    def __init__(self, deadline):
        self.deadline = deadline
        self.next_check = 0
        self.leases = {}
        self.last_request = {}
        self.stopped = False

    def check(self):
        if self.stopped or time.monotonic() >= self.deadline:
            raise SourcePaused('Run budget exhausted')
        if time.monotonic() < self.next_check:
            return
        try:
            state = api_get('/internal/shops/source-backoff')
        except Exception:
            raise RuntimeError('Internal source state unavailable') from None
        if state['manualHold'] or (state['untilAt'] and epoch(state['untilAt']) > time.time()):
            raise SourcePaused('Shared source cooldown')
        self.next_check = time.monotonic() + 15

    def before(self, source):
        gap = 6 if source=='place' else 1
        while True:
            self.check()
            remaining, until = self.leases.get(source,(0,0))
            if remaining and until > time.time():
                wait = self.last_request.get(source,0) + gap - time.monotonic()
                if wait > 0:
                    time.sleep(min(wait, max(0,self.deadline-time.monotonic())))
                    continue
                self.leases[source] = (remaining-1, until)
                self.last_request[source] = time.monotonic()
                return
            try:
                lease = api_post('/internal/shops/request-budget', {'source':source,'count':8})
            except Exception:
                raise RuntimeError('Internal request allocator unavailable') from None
            until = epoch(lease['until'])
            self.leases[source]=(lease['granted'],until)
            if not lease['granted']:
                wait=max(0.25,until-time.time())
                if wait > 60 or time.monotonic()+wait>=self.deadline:
                    raise SourcePaused('Shared source allocation deferred')
                time.sleep(min(wait,15))

    def check_access_page(self, html):
        from catalog_audit import LIMIT_MSG, Pause, VisibleText
        dom = VisibleText()
        dom.feed(html)
        if any(marker in ' '.join(dom.parts) for marker in LIMIT_MSG):
            self.blocked(Pause('Access notice',0))
            raise SourcePaused('Shared source restriction')

    def blocked(self, exc):
        self.stopped = True
        from catalog_audit import Pause
        if isinstance(exc.__cause__, (Pause, HTTPError)):
            exc = exc.__cause__
        if isinstance(exc,Pause):
            status=int(str(exc).split()[-1]) if str(exc).startswith('HTTP ') else 403
            raw=exc.raw or ''
        elif isinstance(exc,HTTPError):
            status,raw=exc.code,(exc.headers or {}).get('Retry-After','')
        else:
            status,raw=403,''
        data={'status':status}
        if raw.isdigit():
            data['retryAfterSeconds']=int(raw)
        elif raw:
            try:
                data['retryAfterSeconds']=max(0,int(parsedate_to_datetime(raw).timestamp()-time.time())+1)
            except (ValueError,TypeError,OverflowError):
                pass
        try:
            api_post('/internal/shops/source-backoff',data)
        except Exception:
            raise RuntimeError('Internal source cooldown write failed') from None
