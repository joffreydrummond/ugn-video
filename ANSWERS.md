# Written answers

These answers describe the current implementation and distinguish proposed production
work. Verification status is in VERIFICATION.md. Pricing assumptions are dated
October 15, 2026; detailed arithmetic and sources are in COST-ESTIMATE.md.

## W1 — Wi-Fi drops at 63%, then returns or the laptop closes overnight

The interrupted PUT fails/aborts; completed 64 MiB parts remain in storage and the
queue pauses. After reconnecting, the admin clicks Resume. The API lists actual
saved parts and signs fresh URLs, so the browser sends missing parts rather than
trusting 63% from localStorage. Only the incomplete part needs retransmission.
After tab close, the queue remembers metadata but cannot reopen a local file without
permission: the admin reselects the original using Choose Files, then clicks Resume.
An overnight gap is within the default seven-day idle period; beyond it, cleanup
may expire the upload and a fresh upload is required. No bytes pass through the API.
This is explicitly resumed, not guaranteed background transfer while asleep.

## W2 — Worker crashes nine hours into processing

Lock renewal stops; after expiry BullMQ detects the stalled job and another attempt
claims it. The job retains its stable video ID; processingToken and lock checks
restrict stale worker writes. Recovery was tested by killing/restarting the worker.
This version downloads the original and re-encodes every rendition, so all nine hours
of compute may be lost. Completed object storage input survives. With another week,
I would first checkpoint completed renditions, then use independently retriable,
keyframe-aligned chunks with immutable attempt output, per-chunk manifests and a final
validated publication step. That reduces work loss but adds A/V sync, discontinuity,
encoder-configuration and partial-output recovery concerns.

## W3 — Monthly AWS estimate and FFmpeg versus MediaConvert

Assume 200 new ten-hour/10 GB inputs each month, one-month retention, three H.264
outputs and 2,000 viewing hours per video: **400,000 viewer-hours**, not 2,000 total.
At an assumed delivered average of 3 Mbps, viewers consume about 540 TB decimal.
A US CloudFront pay-as-you-go model gives roughly $24.2k egress plus $230 segment
requests; S3 storage is about $263 under the stated ladder assumptions. Budgeted
FFmpeg compute is $2.4k (6,000 instance-hours at an assumed $0.40/hour and one realtime
pass per rendition); MediaConvert Basic is about $3.4k for 600,000 normalized minutes.
Totals are approximately **$27.1k FFmpeg or $28.1k MediaConvert**, excluding platform,
logs, scratch EBS and taxes. These are capacity assumptions, not measured throughput
or a quote. I would benchmark first: use FFmpeg where utilization and operational
control justify it, MediaConvert for burst capacity and reduced worker operations.
Delivery bitrate/region dominate cost; input file size does not predict viewing cost.

## W4 — Desktop Chrome works, iPhone or Instagram does not

Common causes include codec/profile or pixel-format incompatibility, unavailable
Media Source Extensions, autoplay restrictions, missing inline playback, mixed HTTP/
HTTPS, CORS/MIME mistakes, or an authorization URL that covers the master but not its
children. The implementation uses H.264/yuv420p with AAC, native HLS detection before
hls.js, playsInline and user-initiated playback, correct MIME/cache headers and explicit
allowed origins. Error/retry states do not pretend playback succeeded. Production
would use HTTPS end to end. Native Safari, HDR conversion and in-app webviews still
need actual-device testing; Chrome on a Samsung phone is not evidence for iOS.

## W5 — Private or paid-only viewing

Remove the public S3 grant, enable Block Public Access and restrict origin access to
CloudFront OAC. An entitlement endpoint would issue short-lived access for a video's
entire object prefix. Signed cookies suit a browser's many HLS requests; native clients
need verified cookie propagation or signed child URLs/manifests when cookies are not
supported. Signing only master.m3u8 is insufficient. Authorize each request at the
edge while keeping shared segment cache keys independent of viewer identity; never
cache personalized entitlement responses publicly. Refresh access before expiration
for long sets and test seeks after expiry. Download revocation is not DRM; use a DRM
system only if the business requires it. This is a proposal, not implemented here.

## W6 — Port to Next.js 14, React 18, Prisma/MySQL and CloudFront

Keep direct S3 multipart uploads, shared validation/contracts, playback API semantics,
BullMQ/Redis and the independent FFmpeg worker. Put upload/player UI in client
components; move small orchestration endpoints into Node-runtime Route Handlers or
retain NestJS behind Next.js. Never route video bytes through Next.js or a serverless
function. Audit React 18-compatible dependency versions, SSR guards for localStorage,
and load hls.js only on the client. Change Prisma provider/migrations and replace
PostgreSQL advisory locks with a MySQL-compatible locking/conditional-transition
strategy; this part cannot be ported by changing only the connection string. Use
CloudFront media URLs, OAC/private access if needed, HTTPS cookies and explicit CORS.
Keep long encoding tasks outside the Next.js request lifecycle.

## W7 — Simplifications and another week

One environment-configured admin, browser-local history/watch position, sequential
parts, one job per worker, full re-encode on retry, fixed potentially upscaled heights,
first-frame poster, development servers and db push are deliberate simplifications.
Custom-thumbnail upload, captions, DRM and multi-tenant accounts are omitted. The
suite uses meaningful mocks plus local subprocess checks; it is not a cloud load test.
10 GB+ and ten-hour measurements are still pending. My next week would prioritize
those measurements, Safari/webview/screen-reader checks, upload-content fingerprints,
checkpointed encoding, immutable attempt publication, hard disk quotas and metrics,
then production auth/migrations, dependency-audit remediation and optimized frontend
bundles. For personal DJ use I would add source-aware compression presets and an explicit original-retention policy. Optional pre-upload compression must run on the uploader device and must not replace the required 10 GB+ test. New portfolio features come after the reliability and operational gaps.

Sources: [AWS pricing and assumptions](COST-ESTIMATE.md);
[AWS signed URLs versus cookies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-choosing-signed-urls-cookies.html);
[AWS signed-cookie behavior](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-cookies.html).
