import { App, Tags } from 'aws-cdk-lib';
import { createApp } from '../bin/createApp';
import { StackComposer } from '../lib/stack-composer';

jest.mock('aws-cdk-lib', () => ({
  App: jest.fn().mockImplementation(() => ({
    node: {
      tryGetContext: jest.fn(),
    },
  })),
  Tags: {
    of: jest.fn().mockReturnValue({
      add: jest.fn(),
    }),
  },
  Stack: jest.fn().mockImplementation(),
}));

jest.mock('../lib/stack-composer');

describe('createApp', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should create an App instance with correct configuration', () => {
    // Set up environment variables
    process.env.CDK_DEFAULT_ACCOUNT = 'test-account';
    process.env.CDK_DEFAULT_REGION = 'test-region';

    const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
    const mockAddTag = jest.fn();
    Tags.of = jest.fn().mockReturnValue({ add: mockAddTag });

    const app = createApp();

    // Verify App creation
    expect(App).toHaveBeenCalled();

    // Verify StackComposer creation
    expect(StackComposer).toHaveBeenCalledWith(
      expect.any(Object),
      {
        env: { account: 'test-account', region: 'test-region' },
      }
    );

    // Verify app is returned
    expect(app).toBeDefined();

    consoleSpy.mockRestore();
  });
});
