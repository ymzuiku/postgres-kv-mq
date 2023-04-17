import { kvex, pgConnect, waiting } from "postgres-kv";
import { mq } from "postgres-mq";
import { config } from "up-dir-env";

config();
kvex.config.clearInterval = 2000;

pgConnect();

mq.baseConfig({
  workerConfig: {
    // removeOnComplete: true,
  },
  queueConfig: {
    // removeOnComplete: true,
    // removeOnFail: true,
    // removeOnCompleteDelay: 9000,
    // removeOnCompleteRatio: 0.2,
    // removeOnFailRatio: 0.2,
  },
});

let a = 0;
let err = 0;

const bigString = Array(9).fill("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").join(",");

setTimeout(() => {
  const timer = setInterval(async () => {
    a += 1;
    if (a > 1000) {
      clearInterval(timer);
      return;
    }

    if (a % 100 === 0) {
      console.log("--debug--insert", a);
    }
    try {
      await mq.Queue("mq13", { name: bigString });
    } catch (e) {
      err += 1;
      console.log("--debug--err", err);
      //
    }
  });

  let n = 0;
  mq.Worker("mq13", async (job) => {
    await waiting(300);
    n += 1;
    if (n === 100) {
      console.log("doing", job.id, job.data.name.length);
    }
  });

  mq.Worker.addListenerCompleted((job) => {
    console.log("--debug--completed", job.id);
  });
  mq.Worker.addListenerFailed((err) => {
    console.log("--debug--completed", err);
  });
}, 0);
