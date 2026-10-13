// Stand-in for the Deno SMTP client so edge-function code can be imported
// (and its logic tested) under Node. Nothing in the tests sends mail.
export class SMTPClient {
  async send(): Promise<void> {}
  async close(): Promise<void> {}
}
