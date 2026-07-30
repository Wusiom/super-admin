import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod, UnauthorizedException } from '@nestjs/common';
import { ApiTokenController } from './api-token.controller';

describe('ApiTokenController 创建语义', () => {
  it('使用 POST 创建 Token，路径保持为 token', () => {
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        ApiTokenController.prototype.getToken,
      ),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(PATH_METADATA, ApiTokenController.prototype.getToken),
    ).toBe('token');
  });

  it('缺少可信用户上下文时返回 401', async () => {
    const service = { generateNewToken: jest.fn() };
    const controller = new ApiTokenController(service as never);

    await expect(controller.getToken({})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.generateNewToken).not.toHaveBeenCalled();
  });

  it('为可信用户创建 Token', async () => {
    const service = {
      generateNewToken: jest.fn().mockResolvedValue('raw-token'),
    };
    const controller = new ApiTokenController(service as never);

    await expect(controller.getToken({ user: { id: 17 } })).resolves.toEqual({
      token: 'raw-token',
    });
    expect(service.generateNewToken).toHaveBeenCalledWith(17);
  });
});
