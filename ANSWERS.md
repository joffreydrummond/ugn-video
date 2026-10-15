# Design questions

## W1. What happens if Wi-Fi drops at 63% of a 10 GB upload? What if the laptop stays closed overnight?

The admin should not have to upload the entire file again. I split the file into
64 MiB parts and send them directly from the browser to storage. Each completed
part is saved independently. If Wi-Fi drops at 63%, the current transfer stops,
the queue pauses, and the parts that already reached storage stay there.

When the connection returns 20 minutes later, the admin clicks Resume. Before
sending more data, the app asks storage which parts it actually received. That
answer determines where the upload continues. The progress bar may move back a
little because the interrupted part was not fully saved, but completed parts are
reused. The API provides fresh upload links if the previous ones have expired.

Closing the laptop introduces one extra step if the page closes or reloads. The
app remembers the upload's name, size and progress in that browser, but it does
not retain access to the file itself. It tells the admin which original file to
select again. After selecting it and clicking Resume, the same saved-parts check
runs. Uploading does not continue while the laptop is asleep.

The default idle limit is seven days, so an overnight interruption normally stays
resumable. Once an upload expires, cleanup removes its saved parts and the admin
must start a new upload. I tested closed-tab and network recovery on smaller files,
and the 12.08 GB DJI upload also resumed successfully after closing the tab and
reselecting the original.

## W2. What happens if a worker crashes nine hours into a ten-hour video? How much work is lost?

The original upload remains in storage. The worker's lock stops renewing when it
crashes. Once that lock expires, BullMQ can recognize the stalled job and recover
it when a healthy worker is available. The lock duration is 120 seconds, so recovery
is not immediate. In the crash test, the same video job restarted automatically
and eventually reached READY.

The significant tradeoff is that this implementation starts encoding again from
the original. It does not save a reusable encoding checkpoint. If the worker crashes
after nine hours of processing, those nine hours of work may need to be repeated.
The admin does not need to upload the source again. Attempt ownership checks also
help prevent an old worker from updating the replacement attempt's progress.

My first improvement would be to save and validate each completed rendition so a
retry could skip it. For longer videos, I would divide the timeline into separately
retriable sections. A failure would then repeat one section instead of the whole
set. That requires careful handling of keyframes, audio timing and the final
playlist, so I kept the initial version simpler and tested its full-restart behavior.

## W3. What would 200 ten-hour, 10 GB videos cost each month on AWS? FFmpeg or MediaConvert?

I would separate storage, encoding and viewing costs. The original file size helps
estimate storage, but it does not tell us how much viewers will download.

For this estimate, I assume 200 new videos each month, one month of retention and
2,000 viewing hours per video during that month. That is 400,000 viewing hours.
I also assume viewers receive an average of 3 Mbps across the quality levels and
that traffic is served in the US/Canada/Mexico CloudFront pricing region. That
works out to about 540 TB of delivered video each month.

| Cost | Approximate monthly amount | Basis |
| --- | ---: | --- |
| S3 storage | $263 | Originals plus three streaming versions, using the bitrate assumptions in the cost model |
| CloudFront delivery | $24,177 | 400,000 viewing hours at 3 Mbps, using regional pay-as-you-go tiers |
| CloudFront segment requests | $230 | Six-second segments and the published free request allowance |
| FFmpeg processing | $2,400 | Assumed 6,000 instance-hours at a budgeted $0.40/hour |
| MediaConvert processing, as an alternative | $3,400 | 600,000 normalized Basic-tier output minutes |

That gives a working estimate of about **$27,100 with FFmpeg** or **$28,100 with
MediaConvert**. It excludes application/database hosting, temporary disks, logging,
backups and taxes. A growing archive would also increase storage costs. The FFmpeg
figure assumes each rendition encodes at real time on the chosen machine; that is
a planning assumption, not a result measured on this prototype. The full arithmetic,
frame-rate assumptions and pricing links are in [COST-ESTIMATE.md](COST-ESTIMATE.md).

I would choose self-hosted FFmpeg when the workload is steady and the team can
operate the workers economically. MediaConvert becomes attractive when uploads
arrive in bursts or managing encoding capacity takes too much engineering time.
I would benchmark the same sample videos before choosing. In either case, viewing
bandwidth is the largest expense in this example, so output quality and bitrate
need as much attention as the encoder bill.

## W4. Why might a video play in Chrome but fail on an iPhone or inside Instagram?

A working desktop player does not guarantee that the same file, player code or
permissions will work on a phone. I would check these areas first:

- **The encoded video.** A phone may not support the source codec, profile or pixel
  format. The worker converts uploads into H.264 with yuv420p video and AAC audio
  where audio exists. This provides a common playback format rather than asking
  every device to decode the original camera file.
- **The playback engine.** Some browsers can play HLS directly; others need hls.js.
  The player checks for native HLS first and uses hls.js when native support is
  unavailable and the browser supports the required media features.
- **Playback restrictions.** Mobile browsers can block autoplay with sound. The
  interface lets the viewer press Play and uses playsInline so playback can stay
  within the page where supported.
- **The media requests.** The playlist can load while a segment fails because of
  CORS, an incorrect content type, mixed HTTP/HTTPS or expired permissions. Every
  playlist and segment must be reachable, not just the first manifest URL.

The application configures media content types and allowed origins, and it presents
an error with a retry action when playback fails. A public deployment also needs
HTTPS throughout. Desktop Chrome, Edge, Firefox, Samsung Chrome and VLC have been
exercised. Safari and Instagram/Facebook/TikTok webviews still need their own device
tests; I would not infer those results from desktop playback.

## W5. How would you make videos private or paid-only without losing CDN caching or native playback?

I would start by making the storage bucket private. Only CloudFront would be
allowed to fetch the media from S3, using Origin Access Control. The application
would check whether the viewer owns the video or has an active subscription before
granting temporary playback access.

For a browser, signed CloudFront cookies are a good fit because one video requires
many requests: the master playlist, a rendition playlist and its segments. Access
must cover that whole set of files. Protecting only the master URL would leave
playback broken or the segments exposed.

For a native player, I would verify that its requests carry the required cookies.
If that client cannot do so, the playback API would return a manifest with signed
child URLs, including access to its segments. Access would need renewal during
long sessions so a viewer can still seek after the initial authorization expires.

CloudFront would validate access before serving the cached object. The underlying
segment URLs and cache keys would remain shared between authorized viewers rather
than creating a separate cached copy for each person. The entitlement response,
which is specific to the viewer, would not be publicly cached. This is the next
access-control design; the assessment currently publishes processed videos publicly.
Signed access also is not DRM and cannot recall media someone already downloaded.

## W6. What changes when moving this into Next.js 14, React 18, Prisma/MySQL and S3/CloudFront?

The main flow stays the same: the browser uploads parts directly to storage, the
API records the video and queues processing, a separate worker runs FFmpeg, and
players fetch HLS from the media host. None of that requires video bytes to pass
through a Next.js request handler.

I would move the upload and player interfaces into client components because they
use browser file access, localStorage and video APIs. Browser-only code such as
hls.js would initialize on the client. I would also check dependency compatibility
with React 18 instead of assuming the React 19 versions can be copied unchanged.
The API could remain NestJS behind the web application, or its small orchestration
endpoints could move into Node-runtime Route Handlers. Encoding would remain a
separate worker process rather than a long-running web request.

The database change needs more care than replacing the connection string. Prisma
would use the MySQL provider and matching migrations, and the PostgreSQL advisory
locks would need replacement. I would use MySQL-compatible transactions and row
locking, with conditional state updates and the same queue job IDs, then rerun the
concurrency and recovery tests. Storage configuration would point to S3 for uploads
and CloudFront for playback, with the appropriate HTTPS cookies and allowed origins.

## W7. What did you simplify, and what would you do with another week?

I kept the project focused on getting an upload into storage reliably, processing
it outside the API and making the result watchable. There is one configured admin,
no signup flow, and browser-local upload history and watch position. Upload parts
and encoding passes run sequentially, with one job per worker. Retries re-encode
from the original, and the three output heights are fixed even when that means
upscaling a small source. Custom-thumbnail uploads, captions and paid access are
outside this version.

The large-file upload and closed-tab resume have passed; processing and playback
of that file are still being measured. Its duration is about 22 minutes, so a true
ten-hour startup and late-seek test remains separate work. With another week, I
would finish those measurements and broaden device testing to Safari, in-app
browsers and a screen reader. I would then add encoding checkpoints and stronger
per-attempt output isolation so a failed long job loses less work.

For the DJ-set workflow, I would add presets that account for the source resolution
and frame rate. The current DJI test is nearly 120 fps; retaining that frame rate
adds encoding work that may not be needed for a streaming set. I would compare
30/60 fps outputs, preserve audio quality and avoid upscaling. An explicit policy
for retaining or deleting originals would help control storage. Compression before
upload would require a separate local/browser processing step; server compression
cannot reduce bytes that have already been uploaded.

Before production deployment, I would also replace the development startup and
Prisma db push workflow with production builds and migrations, strengthen account
security, review the dependency findings, and add monitoring, backups and disk
limits. Those changes would make the service easier to operate as a real library
of sets, beyond the assessment demo.

## References

- [Cost calculations, assumptions and AWS pricing sources](COST-ESTIMATE.md)
- [CloudFront signed URLs versus signed cookies](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-choosing-signed-urls-cookies.html)
- [CloudFront signed-cookie behavior](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-signed-cookies.html)
- [Actual test results and outstanding platform checks](VERIFICATION.md)
