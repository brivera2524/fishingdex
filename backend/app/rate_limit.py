from slowapi import Limiter
from slowapi.util import get_remote_address

# Per-IP is plenty for a 5-10 person friend group — the goal is capping
# runaway cost/abuse (someone scripting requests), not fairly metering
# individual trusted users. In-memory storage (the default) is fine too:
# single Railway instance, no need for a shared Redis-backed counter.
limiter = Limiter(key_func=get_remote_address)
