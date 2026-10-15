# W3 cost model

Planning estimate dated October 15, 2026. No AWS resources were deployed or billed.
USD pay-as-you-go, US East (Ohio) processing/storage and US/Canada/Mexico viewers.
One new 200-video cohort per month, retained one month; a growing archive accumulates
storage even if the same processing/viewing assumptions hold. GB inputs below are
decimal; convert bytes to GiB for this billing approximation (AWS labels prices GB).
CloudFront flat-rate/negotiated plans are not modeled; obtain a quote at this volume.

## Assumptions and arithmetic

| Component | Assumption and calculation | Monthly estimate |
| --- | --- | ---: |
| Inputs | 200 × 10 GB = 2,000 GB decimal | Included below |
| Stored outputs | 6 + 3 + 1.5 Mbps video, three × 0.128 Mbps audio; 2,000 source hours; add 5% packaging allowance | 10,285 GB decimal |
| S3 Standard | Inputs + outputs ≈ 11,442 GiB × budget rate $0.023/GB-month | $263 |
| Viewing | 200 × 2,000 viewer-hours × 3,600 × 3 Mbps / 8 | 540 TB decimal; 502,914 GiB |
| CloudFront data | First 1 TiB free; next 9 TiB $0.085/GB, next 40 $0.080, next 100 $0.060, remaining ~341 TiB $0.040 | $24,177 |
| HTTPS segment requests | 400,000 viewing hours × 600 six-second segments/hour = 240M; first 10M free, remainder $0.01/10k | $230 |
| FFmpeg compute | 200 × 10 hours × 3 passes / assumed 1× encoding speed = 6,000 instance-hours; budget $0.40/hour | $2,400 |
| MediaConvert alternative | 120,000 input minutes × (HD 2 + HD 2 + SD 1) = 600,000 normalized minutes; first 100k × $0.0075 + next 500k × $0.0053 | $3,400 |
| Total with FFmpeg | Storage + CDN data/segment requests + compute | **$27,070** |
| Total with MediaConvert | Replace only FFmpeg compute | **$28,070** |

Compute $0.40/hour is an explicit capacity budget, not an EC2 SKU quote. One realtime
pass per rendition must be benchmarked on the chosen CPU/encoder; this prototype's
2-CPU limit is not evidence for that throughput. Six thousand hours requires roughly
nine concurrent instance slots over a 730-hour month, with burst headroom additional.
At half realtime the compute budget doubles; at twice realtime it halves.

Output bitrate is an assumed planning ladder, not a measurement from CRF output.
3 Mbps delivered includes the assumed blended audio/container overhead; only one
rendition is delivered per viewer at a time. It is not the sum of all three. Retries,
preview/autoplay, packet overhead and geography can increase transfer. Actual tiny
sample playlists are not representative of a full-length set.

The model excludes DB/Redis/API hosting, EBS scratch, monitoring, backups, public
IPv4, NAT and origin request charges. Around 3.6M output segments require PUT requests;
cache misses add S3 GETs. Budget those separately using cache-hit and packaging data.
AWS-origin-to-CloudFront fetch transfer has no additional CloudFront transfer charge;
do not add the entire viewer egress again as S3-to-internet egress. Original upload
traffic is not CDN playback. A simple conservative all-volume ceiling at $0.085/GB
would be ~$42.7k delivery before requests, illustrating the importance of tiers.

## Sources and conditions

- [CloudFront pay-as-you-go pricing](https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/): regional data tiers, HTTPS requests, free allowances and AWS-origin transfer. Checked October 15, 2026. Other viewer regions have different rates; commitments can change pricing.
- [MediaConvert pricing](https://aws.amazon.com/mediaconvert/pricing/): Basic AVC <=30 fps normalization (HD 2x, SD 1x) and US East (Ohio) tier example. 60 fps raises multipliers; higher tiers/features can change prices.
- [S3 pricing](https://aws.amazon.com/s3/pricing/): storage/request categories. $0.023 is the model's S3 Standard budget rate; verify the selected regional calculator rate before purchasing.
- [AWS Pricing Calculator](https://calculator.aws/): use measured encoder speed, retention, region and cache misses before committing spend.

At 400,000 viewer-hours, lowering delivered average bitrate materially changes cost.
Choose FFmpeg versus MediaConvert after measuring equal-quality outputs, concurrency,
retry loss, staff time and capacity. Neither processing choice removes CDN costs.
