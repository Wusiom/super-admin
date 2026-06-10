declare const chrome: {
  runtime: {
    sendMessage: (
      extensionId: string,
      message: Record<string, unknown>,
    ) => Promise<unknown>;
  };
};
