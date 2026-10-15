# Large-media test and evidence

Pending at document preparation. Do not mark passed until measured. The candidate
has a reported 11.2 GB DJI MP4; exact bytes and duration are not yet captured.
An 11.2 GB short clip does not establish ten-hour startup/late-seek behavior.
Do not compress this assessment input: retain a true >=10 GB browser upload test.

## 1. Read-only preflight on the original project

Stop the clean-test Compose project before starting the original; they share ports.
Use the original project and its existing volumes for this test, not the detached
clean checkout. In PowerShell run separately, stopping if anything fails:

```powershell
Set-Location C:\Users\jaydr\OneDrive\Documents\ugn-video
$largeVideo = 'C:\Users\jaydr\Videos\DJI_20261011132443_0045_D.MP4'
$media = Get-Item -LiteralPath $largeVideo
$media | Select-Object Name, Length, @{Name='GiB';Expression={[math]::Round($_.Length / 1GB, 3)}}
Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free

docker compose ps
docker compose exec worker df -h /work
docker system df

docker compose run --rm --no-deps -v "${largeVideo}:/input/test.mp4:ro" worker ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height,avg_frame_rate -of json /input/test.mp4
```

The bind mount is read-only and ffprobe only reads metadata. This one-off command
uses the worker image but does not start a BullMQ consumer or upload the file.
Docker Desktop must have access to the Windows file. If the mount fails, stop and
check the path; do not copy the whole file into the repo as a workaround.

Record duration seconds, exact bytes, streams/frame rate and free disk. Check the
Windows drive containing Docker's virtual disk as well as the video's drive. A high
Docker filesystem free count is not proof the backing Windows drive has capacity.

## 2. Estimate working space before proceeding

Use probed duration D seconds and exact original bytes S. A conservative planning
budget for rendition output is D × 11.4282 Mbps / 8 (the configured three video caps
plus three 128 kbps audio tracks and 5% overhead). It is an estimate, not a hard
maximum. Short samples and CRF output vary; monitor live. The original exists in
storage plus a worker scratch copy; generated output exists in scratch and storage
during publishing. Allow approximately **2S + 2R plus substantial spare headroom**
within Docker, excluding the original Windows source if on another filesystem.
For a ten-hour clip, R is about 51.4 GB decimal under this assumption, so even a
10 GB original can need over 120 GB extra Docker capacity during publishing.

The default per-attempt scratch soft limit is 100 GiB and free-space floor 512 MiB;
these do not reserve the 2S+2R total or guarantee safety. Do not begin until the
probed duration and free space are reviewed. Do not delete named volumes to free
space without knowing what data they contain.

## 3. Record upload and resume

Use an admin browser at the configured localhost/LAN origin. Give the set a clear
test title. Record start time, exact file size and browser/device version. In Network,
verify large PUT requests target storage port 9000, not API port 3000. Never publish
presigned URLs or cookies. Pause after several saved parts, close/reopen the tab,
reselect the unchanged original, click Start/Resume and record confirmed progress.
Check completed parts are reused; the incomplete current part may be resent.
Record completion time and session ID. Confirm original byte size via inspector
snapshot while retaining that ID. Browser-to-local-MinIO tests a home machine, not
an actual WAN upload link; state that distinction in results.

## 4. Monitor processing

Open separate PowerShell windows in the original project:

```powershell
docker compose logs -f --tail=30 worker
```

```powershell
docker stats $(docker compose ps -q worker backend)
```

Periodically record scratch capacity and size:

```powershell
docker compose exec worker sh -c 'du -sh /work; df -h /work'
```

Ctrl+C exits log/stat viewing, not the containers. Capture stage transitions, wall
time, peak observed memory/CPU/scratch and any retry. Sampled observations are not a
continuous profiler. If disk becomes unsafe, Stop processing from the admin page;
do not keep encoding to force a pass. One large test cannot establish a scale SLA.

## 5. Verify outputs and long-duration behavior

At READY compare duration with ffprobe, play/audio/seek all qualities, and confirm
Auto switching and a public signed-out link. Measure cold first-frame time after a
user Play click with browser cache disabled; repeat a few times, state device/network.
On a true ten-hour video, seek to 07:42:10 (27,730 seconds), measure time to moving
video/audio and inspect requests for nearby segments, not the full original.
With a shorter source, record its actual late-seek point without claiming ten-hour
coverage. A synthetic long sample can be separate, clearly labeled evidence; avoid
starting an expensive ten-hour encode before estimating resources/deadline.

## Results template

| Metric | Actual result |
| --- | --- |
| Commit tested | Pending |
| File name / exact bytes | Pending |
| Duration / dimensions / fps / codecs | Pending |
| Browser / OS / machine | Pending |
| Docker disk and host free space before | Pending |
| Upload / resume points / confirmed part reuse | Pending |
| API versus storage request evidence | Pending |
| Session ID / stored original size | Pending |
| Processing wall time / retry count | Pending |
| Peak observed worker CPU / memory / scratch | Pending |
| READY / output duration / three qualities | Pending |
| Cold first-frame measurements | Pending |
| Actual duration and late-seek measurements | Pending |
| Failures / limitations | Pending |
