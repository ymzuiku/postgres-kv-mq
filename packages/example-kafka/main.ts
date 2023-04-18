import { kvex, pgConnect } from "postgres-kv";
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
const table = "mq15";

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
      await mq.Queue(table, { name: bigString });
    } catch (e) {
      err += 1;
      console.log("--debug--err", err);
      //
    }
  });

  let n = 0;
  mq.Worker(table, async (job) => {
    // await waiting(300);
    job.id * 2;
  });

  mq.Worker.addListenerCompleted((job) => {
    n += 1;
    if (job.id % 100 === 0) {
      console.log("completed", job.id, job.data.name.length);
    }
    // console.log("--debug--completed", job.id);
  });
  mq.Worker.addListenerFailed((err) => {
    console.log("--debug--completed", err.message);
  });
}, 0);
