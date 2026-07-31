import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";

const CurrentDirectory = dirname(fileURLToPath(import.meta.url));
const OutputDirectory = join(CurrentDirectory, "output");
const FramesDirectory = join(OutputDirectory, "frames");
const AudioDirectory = join(OutputDirectory, "audio");
const ChromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SentMessageSoundPath = "/System/Library/Components/CoreAudio.component/Contents/SharedSupport/SystemSounds/system/SentMessage.caf";
const ReceivedMessageSoundPath = "/System/Library/PrivateFrameworks/ToneLibrary.framework/Versions/A/Resources/AlertTones/ReceivedMessage.caf";
const FramesPerSecond = 30;
const StoryArgumentIndex = process.argv.indexOf("--story");
const StoryPath = StoryArgumentIndex >= 0
  ? resolve(process.cwd(), process.argv[StoryArgumentIndex + 1])
  : join(CurrentDirectory, "story-media.json");
const OutputArgumentIndex = process.argv.indexOf("--output");
const OutputFileName = OutputArgumentIndex >= 0
  ? process.argv[OutputArgumentIndex + 1]
  : "ios26-imessage-proof.mp4";
if (!/^[a-z0-9][a-z0-9._-]*\.mp4$/i.test(OutputFileName)) {
  throw new Error(`Invalid output filename: ${OutputFileName}`);
}
const StoryDirectory = dirname(StoryPath);
const Story = JSON.parse(await readFile(StoryPath, "utf8"));

const MimeTypes = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);
const inlineLocalImage = async (ImagePath) => {
  if (
    typeof ImagePath !== "string"
    || /^(?:data:|https?:|blob:|file:)/i.test(ImagePath)
  ) {
    return ImagePath;
  }
  const AbsoluteImagePath = resolve(StoryDirectory, ImagePath);
  const Extension = AbsoluteImagePath.slice(AbsoluteImagePath.lastIndexOf(".")).toLowerCase();
  const MimeType = MimeTypes.get(Extension);
  if (!MimeType) {
    throw new Error(`Unsupported image type for ${AbsoluteImagePath}`);
  }
  const ImageBytes = await readFile(AbsoluteImagePath);
  return `data:${MimeType};base64,${ImageBytes.toString("base64")}`;
};

Story.avatarImage = await inlineLocalImage(Story.avatarImage);
Story.photoLibrary = await Promise.all((Story.photoLibrary ?? []).map(async (Item) => {
  if (typeof Item === "string") return inlineLocalImage(Item);
  return {
    ...Item,
    image: await inlineLocalImage(Item.image),
  };
}));
Story.galleryPool = await Promise.all((Story.galleryPool ?? []).map(async (Item) => {
  if (typeof Item === "string") return inlineLocalImage(Item);
  return {
    ...Item,
    image: await inlineLocalImage(Item.image),
  };
}));
Story.messages = await Promise.all((Story.messages ?? []).map(async (Message) => ({
  ...Message,
  image: await inlineLocalImage(Message.image),
  thumbnail: await inlineLocalImage(Message.thumbnail),
})));
Story.messages.forEach((Message, MessageIndex) => {
  const MessageKind = Message.kind ?? Message.type ?? "text";
  if (!["text", "image", "photo"].includes(MessageKind)) {
    throw new Error(`messages[${MessageIndex}].kind is not supported: ${MessageKind}`);
  }
  if (["image", "photo"].includes(MessageKind)) {
    if (Message.side !== "sent") {
      throw new Error(`messages[${MessageIndex}] image flows currently require side "sent"`);
    }
    if (!Message.image && !Message.thumbnail) {
      throw new Error(`messages[${MessageIndex}] image flow requires an image path`);
    }
    if (Message.sendVia && !["camera", "photos"].includes(Message.sendVia)) {
      throw new Error(`messages[${MessageIndex}].sendVia must be "camera" or "photos"`);
    }
  } else if (typeof Message.text !== "string") {
    throw new Error(`messages[${MessageIndex}] text message requires text`);
  }
});
const Viewport = {
  width: Story.viewport?.width ?? 720,
  height: Story.viewport?.height ?? 1280,
};
for (const [DimensionName, DimensionValue] of Object.entries(Viewport)) {
  if (
    !Number.isInteger(DimensionValue)
    || DimensionValue < 320
    || DimensionValue > 4096
    || DimensionValue % 2 !== 0
  ) {
    throw new Error(
      `viewport.${DimensionName} must be an even integer between 320 and 4096`
    );
  }
}

await mkdir(OutputDirectory, { recursive: true });
await rm(FramesDirectory, { recursive: true, force: true });
await rm(AudioDirectory, { recursive: true, force: true });
await mkdir(FramesDirectory, { recursive: true });
await mkdir(AudioDirectory, { recursive: true });

const SoundFiles = [];
if (Story.sounds?.enabled) {
  Story.messages.forEach((Message, MessageIndex) => {
    const IsSent = Message.side === "sent";
    SoundFiles.push({
      MessageIndex,
      SoundPath: IsSent ? SentMessageSoundPath : ReceivedMessageSoundPath,
      Volume: IsSent
        ? (Story.sounds.sentVolume ?? .7)
        : (Story.sounds.receivedVolume ?? .65),
    });
  });
}

const Browser = await chromium.launch({
  executablePath: ChromePath,
  headless: true,
});
const Context = await Browser.newContext({
  viewport: Viewport,
  deviceScaleFactor: 1,
});
await Context.addInitScript((StoryConfig) => {
  window.__CHAT_STORY__ = StoryConfig;
}, Story);
const Page = await Context.newPage();
const RendererUrl = new URL("./index.html", import.meta.url);
RendererUrl.searchParams.set("t", "0");
await Page.goto(RendererUrl.href);
await Page.evaluate(() => window.__assetsReady);
const RenderMetadata = await Page.evaluate(() => ({
  duration: window.__renderDuration,
  soundSchedule: window.__soundSchedule,
}));
const DurationSeconds = RenderMetadata.duration;
const FrameCount = Math.ceil(DurationSeconds * FramesPerSecond);
for (let FrameIndex = 0; FrameIndex < FrameCount; FrameIndex += 1) {
  const FrameTime = FrameIndex / FramesPerSecond;
  await Page.evaluate((Seconds) => window.__renderAt(Seconds), FrameTime);
  const FrameName = `frame-${String(FrameIndex).padStart(4, "0")}.png`;
  await Page.screenshot({ path: join(FramesDirectory, FrameName) });
}
await Page.close();
await Context.close();
await Browser.close();

const SilentMp4Path = join(OutputDirectory, "ios26-imessage-silent.mp4");
execFileSync(
  "ffmpeg",
  [
    "-y",
    "-framerate",
    String(FramesPerSecond),
    "-i",
    join(FramesDirectory, "frame-%04d.png"),
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    SilentMp4Path,
  ],
  { stdio: "ignore" },
);

const Mp4Path = join(OutputDirectory, OutputFileName);
if (SoundFiles.length > 0) {
  const AudioInputArguments = SoundFiles.flatMap(({ SoundPath }) => ["-i", SoundPath]);
  const AudioFilterParts = SoundFiles.map(({ MessageIndex, Volume }, SoundIndex) => {
    const SoundStart = RenderMetadata.soundSchedule.find(
      (ScheduledSound) => ScheduledSound.index === MessageIndex
    )?.soundStart ?? 0;
    const DelayMilliseconds = Math.round(SoundStart * 1000);
    return `[${SoundIndex + 1}:a]adelay=${DelayMilliseconds}:all=1,volume=${Volume}[sound${SoundIndex}]`;
  });
  const MixedSoundInputs = SoundFiles.map((_, SoundIndex) => `[sound${SoundIndex}]`).join("");
  AudioFilterParts.push(
    `${MixedSoundInputs}amix=inputs=${SoundFiles.length}:duration=longest:normalize=0,alimiter=limit=0.95:attack=5:release=50[mixed]`
  );
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      SilentMp4Path,
      ...AudioInputArguments,
      "-filter_complex",
      AudioFilterParts.join(";"),
      "-map",
      "0:v:0",
      "-map",
      "[mixed]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-t",
      String(DurationSeconds),
      "-movflags",
      "+faststart",
      Mp4Path,
    ],
    { stdio: "ignore" },
  );
} else {
  await rm(Mp4Path, { force: true });
  await rename(SilentMp4Path, Mp4Path);
}

console.log(Mp4Path);
