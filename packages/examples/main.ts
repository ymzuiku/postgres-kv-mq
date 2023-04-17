import { kvex, pgConnect } from "postgres-kv";
import { mq } from "postgres-mq";
import { config } from "up-dir-env";

config();
kvex.config.clearInterval = 2000;

pgConnect();

mq.baseConfig({
  queueConfig: {
    removeOnComplete: true,
    removeOnFail: true,
  },
});

let a = 0;

setTimeout(() => {
  const timer = setInterval(() => {
    a += 1;
    if (a > 1000) {
      clearInterval(timer);
      return;
    }

    mq.Queue("mq3", { name: "aaaaaaaaaaaa" });
  });

  mq.Worker("mq3", (job) => {
    console.log("doing", job.id, job.data);
  });

  // Worker.addListenerCompleted((job) => {
  //   console.log("--debug--completed", job.id);
  // });
}, 1000);
