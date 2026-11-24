# BootWeave actual-demo edit

The final video retains every raw MP4, AIFF, and transcript. Browser footage is
1440×810 at 1:1 pixel size, placed above a reserved 90-pixel branding/caption band
on a 1440×900 canvas. Captions and titles do not obscure the UI. The 2.8-second
opening and 3.2-second closing cards contain original project branding and copy.

Each narrated scene lasts its original audio duration plus at least 0.7 seconds,
rounded to a 30fps frame boundary. Longer clips are uniformly sped up by the
documented factor; shorter clips play at original speed and then hold the final
frame. Scene 04 is trimmed after source 8.8 seconds and scene 07 after source 6.2
seconds to remove recorder-stop artifacts that shrink the UI into one quarter of
the canvas. Their final holds use the last clean actual video frame; no external
screenshot or replacement UI is used. The export confirmation is visible earlier
in the original scene 07. Source footage is never cropped, reconstructed, or interpolated. Recorded
QNX observations and static-model review are explicitly distinguished in narration,
chapter labels, and the lower third. No timing, availability, certification, or
authentication claim is inferred from edited playback.

Narration wording and speed are unchanged. Loudness is normalized per scene;
silence padding and resampling support consistent H.264/AAC playback. No music
is included. Burned-in captions use approximate phrase timings from segments.json;
the SRT and ASS files are also supplied. Technical edit details, source/final
hashes, chapter timings, and ffprobe output are in video-edit-manifest.json.

Rebuild: run `python3 compose_demo.py` after extracting the media source archive.
Requires ffmpeg/ffprobe, system Arial fonts, and no additional Python packages.
The contact sheet and full-resolution QA frames are generated from the final MP4.
