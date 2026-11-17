import { deliverImage } from '../deliver';

const file = () => new Blob(['png'], { type: 'image/png' });

describe('deliverImage', () => {
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    delete (navigator as { canShare?: unknown }).canShare;
    delete (navigator as { share?: unknown }).share;
  });

  it('uses the system share sheet when it can take a file', async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    navigator.canShare = () => true;
    navigator.share = share;

    await expect(deliverImage(file(), 'wangpt.png')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)] });
  });

  it('downloads the file when sharing files is unavailable', async () => {
    URL.createObjectURL = jest.fn().mockReturnValue('blob:survey');
    URL.revokeObjectURL = jest.fn();
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    await expect(deliverImage(file(), 'wangpt-flight.png')).resolves.toBe('downloaded');
    expect(click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:survey');
    click.mockRestore();
  });
});
