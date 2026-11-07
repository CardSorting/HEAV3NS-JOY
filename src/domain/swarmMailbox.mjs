/** [LAYER: DOMAIN] */
/**
 * Zero-dependency inter-agent mailbox. Provides decentralized inter-subagent communication queues (postMessage, pollInbox, postStatus)
 * with ring-buffer FIFO message bounds. Zero external npm dependencies.
 */
import { newUuid } from "../plumbing/ids.mjs";
export class BroccoliInterAgentMailbox {
    messages = [];
    maxMessages;
    constructor(maxMessages = 1000) {
        this.maxMessages = maxMessages;
    }
    /**
     * Posts a message to a specific target agent's inbox.
     */
    postMessage(to, from, type, payload) {
        const msg = {
            id: newUuid(),
            from,
            to,
            type,
            payload,
            timestamp: Date.now(),
            read: false,
        };
        this.messages.push(msg);
        if (this.messages.length > this.maxMessages) {
            this.messages.splice(0, this.messages.length - this.maxMessages);
        }
        return msg;
    }
    /**
     * Helper method to broadcast status notifications.
     */
    postStatus(agentId, status) {
        return this.postMessage("system", agentId, "vibe", { status });
    }
    /**
     * Polls all unread messages for a target agent and marks them read.
     */
    pollInbox(agentId) {
        const unread = this.messages.filter((m) => m.to === agentId && !m.read);
        for (const m of unread) {
            m.read = true;
        }
        return unread;
    }
}
