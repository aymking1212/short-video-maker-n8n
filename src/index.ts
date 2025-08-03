/* eslint-disable @typescript-eslint/no-unused-vars */
import path from "path";
import fs from "fs-extra";
import cors from "cors";
import express from "express";
import dotenv from "dotenv";

import { Kokoro } from "./short-creator/libraries/Kokoro";
import { Remotion } from "./short-creator/libraries/Remotion";
import { Whisper } from "./short-creator/libraries/Whisper";
import { FFMpeg } from "./short-creator/libraries/FFmpeg";
import { PexelsAPI } from "./short-creator/libraries/Pexels";
import { Config } from "./config";
import { ShortCreator } from "./short-creator/ShortCreator";
import { logger } from "./logger";
import { MusicManager } from "./short-creator/music";

// تحميل المتغيرات من .env
dotenv.config();

async function main() {
  const config = new Config();

  try {
    config.ensureConfig();
  } catch (err: unknown) {
    logger.error(err, "❌ خطأ في تحميل الإعدادات (config). تحقق من ملف .env أو config.json");
    process.exit(1);
  }

  // تحقق من وجود متغيرات بيئية مهمة
  const requiredEnv = ["PEXELS_API_KEY"];
  for (const variable of requiredEnv) {
    if (!process.env[variable]) {
      logger.fatal(`❌ المتغير البيئي ${variable} غير موجود. أضفه إلى ملف .env`);
      process.exit(1);
    }
  }

  const musicManager = new MusicManager(config);
  try {
    logger.debug("✅ التحقق من ملفات الموسيقى");
    musicManager.ensureMusicFilesExist();
  } catch (error: unknown) {
    logger.error(error, "❌ ملفات الموسيقى غير موجودة");
    process.exit(1);
  }

  logger.debug("🚀 بدء تهيئة Remotion");
  const remotion = await Remotion.init(config);
  logger.debug("🚀 بدء تهيئة Kokoro");
  const kokoro = await Kokoro.init(config.kokoroModelPrecision);
  logger.debug("🚀 بدء تهيئة Whisper");
  const whisper = await Whisper.init(config);
  logger.debug("🚀 بدء تهيئة FFMpeg");
  const ffmpeg = await FFMpeg.init();
  const pexelsApi = new PexelsAPI(config.pexelsApiKey);

  logger.debug("🛠️ بدء تهيئة ShortCreator");
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
      logger.info("✅ التثبيت تم بنجاح - يتم الآن تشغيل الخادم");
    } else {
      logger.info("🔍 اختبار بيئة التثبيت - قد يستغرق ذلك بعض الوقت...");
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
        logger.info("✅ التثبيت تم بنجاح - يتم الآن تشغيل الخادم");
      } catch (error: unknown) {
        logger.fatal(
          error,
          "❌ البيئة غير مهيئة بشكل صحيح - يرجى مراجعة README.md: https://github.com/gyoridavid/short-video-maker"
        );
        process.exit(1);
      }
    }
  }

  const app = express();
  app.use(cors());

  // 📦 تقديم ملفات الواجهة الأمامية
  const uiPath = path.resolve(__dirname, "ui");
  app.use(express.static(uiPath));

  app.get("/", (req, res) => {
    res.sendFile(path.join(uiPath, "index.html"));
  });

  app.get("*", (req, res) => {
    res.sendFile(path.join(uiPath, "index.html"));
  });

  // استخدام منفذ من Railway إذا توفر، أو 3000 افتراضيًا
  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, '0.0.0.0', () => {
    logger.info(`🚀 الخادم يعمل على http://0.0.0.0:${port}`);
  });
}

main().catch((error: unknown) => {
  logger.error(error, "❌ خطأ أثناء تشغيل الخادم");
});


