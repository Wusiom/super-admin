describe('SessionController cookie configuration', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.resetModules();
  });

  it('sets Secure when the controller module is loaded in production', async () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    let SessionController: typeof import('./session.controller').SessionController;
    jest.isolateModules(() => {
      ({ SessionController } =
        require('./session.controller') as typeof import('./session.controller'));
    });
    const response = { cookie: jest.fn() };
    const controller = new SessionController(
      {
        authenticate: jest.fn().mockResolvedValue({ id: 7, role: 'USER' }),
      } as never,
      {
        createSession: jest.fn().mockResolvedValue({
          accessToken: 'access',
          refreshToken: 'refresh',
        }),
      } as never,
      {} as never,
    );

    await controller.login(
      { email: 'alice@example.test', password: 'password' },
      { get: jest.fn() } as never,
      response as never,
    );

    expect(response.cookie).toHaveBeenCalledWith(
      'super_admin_refresh',
      'refresh',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/auth',
        secure: true,
      }),
    );
  });
});
