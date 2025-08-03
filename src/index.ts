/* eslint-disable @typescript-eslint/no-unused-vars */
import path from "path";
import fs from "fs-extra";
import cors from "cors";
import express from "express";

import { Kokoro } from "./short-creator/libraries/Kokoro";
import { Remotion } from "./short-creator/libraries/Remotion";
import { Whisper } from "./short-creator/libraries/Whisper";
import { FFMpeg } from "./short-creator/libraries/FFmpeg";
import { PexelsAPI } from "./short-creator/libraries/Pexels";
import { Config } from "./config";
import { ShortCreator } from "./short-creator/ShortCreator";
import { logger } from "./logger";
import { MusicManager } from "./short-creator/music";

async function main() {
  const config = new Config();
  try {
    config.ensureConfig();
  } catch (err: unknown) {
    logger.error(err, "Error in config");
    process.exit(1);
  }

  const musicManager = new MusicManager(config);
  try {
    logger.debug("checking music files");
    musicManager.ensureMusicFilesExist();
  } catch (error: unknown) {
    logger.error(error, "Missing music files");
    process.exit(1);
  }

  logger.debug("initializing remotion");
  const remotion = await Remotion.init(config);
  logger.debug("initializing kokoro");
  const kokoro = await Kokoro.init(config.kokoroModelPrecision);
  logger.debug("initializing whisper");
  const whisper = await Whisper.init(config);
  logger.debug("initializing ffmpeg");
  const ffmpeg = await FFMpeg.init();
  const pexelsApi = new PexelsAPI(config.pexelsApiKey);

  logger.debug("initializing the short creator");
  const shortCreator = new ShortCreator(
    config,
    remotion,
    kokoro,
    whisper,
    ffmpeg,
    pexelsApi,
    musicManager
  );

  if (!config.runningInDocker) {
    if (fs.existsSync(config.installationSuccessfulPath)) {
      logger.info("the installation is successful - starting the server");
    } else {
      logger.info("testing if the installation was successful - this may take a while...");
      try {
        const audioBuffer = (await kokoro.generate("hi", "af_heart")).audio;
        await ffmpeg.createMp3DataUri(audioBuffer);
        await pexelsApi.findVideo(["dog"], 2.4);
        const testVideoPath = path.join(config.tempDirPath, "test.mp4");
        await remotion.testRender(testVideoPath);
        fs.rmSync(testVideoPath, { force: true });
        fs.writeFileSync(config.installationSuccessfulPath, "ok", {
          encoding: "utf-8",
        });
        logger.info("the installation was successful - starting the server");
      } catch (error: unknown) {
        logger.fatal(
          error,
          "The environment is not set up correctly - please follow the instructions in the README.md file https://github.com/gyoridavid/short-video-maker"
        );
        process.exit(1);
      }
    }
  }

  const app = express();

  // ✅ تفعيل CORS
  app.use(cors());

  // ✅ المسار الصحيح لمجلد الواجهة بعد البناء
  const uiPath = path.join(__dirname, "..", "dist", "ui");
  app.use(express.static(uiPath));

  // ✅ عرض index.html عند الوصول إلى الجذر أو أي مسار غير موجود
  app.get("/", (req, res) => {
    res.sendFile(path.join(uiPath, "index.html"));
  });

  app.get("*", (req, res) => {
    res.sendFile(path.join(uiPath, "index.html"));
  });

  // ✅ بدء الخادم
  const port = config.port ?? 3000;
  app.listen(port, () => {
    logger.info(`Server is running on http://localhost:${port}`);
  });
}

main().catch((error: unknown) => {
  logger.error(error, "Error starting server");
});
