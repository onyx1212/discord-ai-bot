const PQueue = require('p-queue').default;
const config = require('../config');
const { createContextLogger } = require('../utils/Logger');

const log = createContextLogger('Queue');

class QueueSystem {
  constructor() {
    this.queues = new Map();
    this.activeJobs = new Map();

    this.queues.set('clone', new PQueue({ concurrency: 1, timeout: config.limits.cloneTimeout, throwOnTimeout: true }));
    this.queues.set('generate', new PQueue({ concurrency: config.performance.queueConcurrency, timeout: config.limits.generateTimeout, throwOnTimeout: true }));
    this.queues.set('backup', new PQueue({ concurrency: 2, timeout: 120000 }));
    this.queues.set('ai', new PQueue({ concurrency: 5, timeout: config.ai.timeoutMs * 2 }));
    this.queues.set('default', new PQueue({ concurrency: 10 }));

    for (const [name, queue] of this.queues.entries()) {
      queue.on('add', () => log.debug(`Job added to queue`, { queue: name, size: queue.size }));
      queue.on('next', () => log.debug(`Job started`, { queue: name, pending: queue.pending }));
      queue.on('error', (err) => log.error(`Queue error`, { queue: name, error: err.message }));
      queue.on('idle', () => log.debug(`Queue idle`, { queue: name }));
    }
  }

  async add(queueName, jobFn, options = {}) {
    const queue = this.queues.get(queueName) || this.queues.get('default');
    const jobId = options.jobId || `${queueName}-${Date.now()}`;

    const job = {
      id: jobId,
      queue: queueName,
      userId: options.userId,
      guildId: options.guildId,
      startedAt: null,
      status: 'queued',
    };

    this.activeJobs.set(jobId, job);

    try {
      const result = await queue.add(async () => {
        job.startedAt = new Date();
        job.status = 'running';
        this.activeJobs.set(jobId, job);

        log.info(`Job started`, { jobId, queue: queueName, userId: options.userId });

        try {
          const result = await jobFn();
          job.status = 'completed';
          log.info(`Job completed`, { jobId, queue: queueName, duration: Date.now() - job.startedAt.getTime() });
          return result;
        } catch (err) {
          job.status = 'failed';
          job.error = err.message;
          throw err;
        }
      }, { priority: options.priority || 0, signal: options.signal });

      return result;
    } finally {
      setTimeout(() => this.activeJobs.delete(jobId), 30000);
    }
  }

  getStatus(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) return null;
    return {
      name: queueName,
      size: queue.size,
      pending: queue.pending,
      isPaused: queue.isPaused,
    };
  }

  getAllStatus() {
    const status = {};
    for (const [name, queue] of this.queues.entries()) {
      status[name] = { size: queue.size, pending: queue.pending };
    }
    return status;
  }

  getActiveJobs(userId) {
    const jobs = [];
    for (const job of this.activeJobs.values()) {
      if (!userId || job.userId === userId) jobs.push(job);
    }
    return jobs;
  }

  async clear(queueName) {
    const queue = this.queues.get(queueName);
    if (queue) {
      queue.clear();
      log.info(`Queue cleared`, { queue: queueName });
    }
  }

  getQueuePosition(queueName) {
    const queue = this.queues.get(queueName);
    return queue ? queue.size : 0;
  }
}

module.exports = new QueueSystem();
