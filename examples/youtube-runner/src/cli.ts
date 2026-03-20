#!/usr/bin/env node
import { YouTubeRunner } from './index.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const runner = new YouTubeRunner();

  try {
    await runner.initialize();

    switch (command) {
      case 'create': {
        const topic = args[1];
        if (!topic) {
          console.error('Usage: youtube-runner create <topic>');
          process.exit(1);
        }
        const result = await runner.createAndUpload(topic);
        console.log('Video created and uploaded:');
        console.log(`  Path: ${result.videoPath}`);
        console.log(`  URL: ${result.uploadUrl}`);
        break;
      }

      case 'schedule': {
        const topic = args[1];
        const time = args[2];
        if (!topic || !time) {
          console.error('Usage: youtube-runner schedule <topic> <ISO datetime>');
          process.exit(1);
        }
        const scheduledTime = new Date(time);
        const result = await runner.scheduleVideo(topic, scheduledTime);
        console.log('Video scheduled:');
        console.log(`  Path: ${result.videoPath}`);
        console.log(`  URL: ${result.uploadUrl}`);
        break;
      }

      case 'review': {
        const videoIds = args.slice(1);
        if (videoIds.length === 0) {
          console.error('Usage: youtube-runner review <videoId> [videoId...]');
          process.exit(1);
        }
        await runner.reviewAnalytics(videoIds);
        console.log('Analytics review completed');
        break;
      }

      case 'tasks': {
        const tasks = await runner.getPendingTasks();
        console.log('Pending tasks:');
        for (const task of tasks) {
          console.log(`  - [${task.id}] ${task.title}`);
        }
        break;
      }

      default:
        console.log('YouTube Runner - AI-powered YouTube channel management');
        console.log('');
        console.log('Commands:');
        console.log('  create <topic>              Create and upload a video');
        console.log('  schedule <topic> <time>     Schedule a video for later');
        console.log('  review <videoId...>         Review analytics for videos');
        console.log('  tasks                       List pending tasks');
    }
  } finally {
    await runner.close();
  }
}

main().catch(console.error);
