import { kvex, pgConnect } from "postgres-kv";
import { mq } from "postgres-mq";
import { config } from "up-dir-env";

config();
kvex.config.clearInterval = 2000;

pgConnect();

mq.baseConfig({
  workerConfig: {
    removeOnComplete: true,
  },
  queueConfig: {
    // delay: 9000,
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
const table = "mq23";
// mq.setUnlogged("mq22");

setTimeout(() => {
  const timer = setInterval(async () => {
    a += 1;
    if (a > 10) {
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
      console.log("--debug--err", err, e);
      //
    }
  });

  mq.Worker(table, async (job) => {
    // await waiting(300);
    job.id * 2;
    return { dog: job.id + "ddddog" };
  });

  mq.Worker.addListenerCompleted((job) => {
    if (job.id % 2 === 1) {
      throw new Error("err" + job.id);
    }
    if (job.id % 100 === 0) {
      console.log("completed", job.id, job.response?.dog);
    }
    // console.log("--debug--completed", job.id);
  });
  mq.Worker.addListenerFailed((err) => {
    console.log("--debug--faild", err.message);
  });
  mq.Worker.addListenerCompleted((job) => {
    console.log("--debug--completed", job.id);
  });
}, 0);
