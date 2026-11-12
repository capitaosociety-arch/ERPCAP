import assert from 'node:assert';
import { isDailyQuotaError, isUnavailableError, isRateLimitError } from '../../lib/ai/retry';

assert.equal(isDailyQuotaError('429 quota exceeded: generate_content_free_tier_requests per day'), true);
assert.equal(isDailyQuotaError('503 service unavailable'), false);
assert.equal(isDailyQuotaError('429 too many requests, retry in 2s'), false);
assert.equal(isUnavailableError('503 Service Unavailable'), true);
assert.equal(isUnavailableError('529 overloaded'), true);
assert.equal(isUnavailableError('429 too many requests'), false);
assert.equal(isRateLimitError('429 too many requests'), true);

console.log('ai-resilience tests: OK');
