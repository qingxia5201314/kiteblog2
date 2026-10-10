import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { MediaPreviewPage } from './MediaPreviewPage';

describe('MediaPreviewPage', () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  async function waitFor(check: () => Element | null, attempts = 80) {
    for (let index = 0; index < attempts; index += 1) {
      const result = check();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return null;
  }

  afterEach(() => {
    roots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
  });

  it('shows player chrome and switches portrait videos to portrait layout', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    root.render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/files/preview',
            state: {
              url: '/api/files/raw/file-1?token=preview-token',
              originalName: 'portrait.mp4',
              contentType: 'video/mp4'
            }
          }
        ]}
      >
        <Routes>
          <Route path="/files/preview" element={<MediaPreviewPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await waitFor(() => host.querySelector('.media-preview-page'))).toBeTruthy();
    expect(host.querySelector('.media-preview-controls')).toBeTruthy();

    const playButton = host.querySelector('.media-preview-overlay button') as HTMLButtonElement | null;
    expect(playButton).toBeTruthy();
    playButton?.click();

    const video = host.querySelector('video.media-preview-player') as HTMLVideoElement | null;
    expect(video).toBeTruthy();
    Object.defineProperty(video!, 'videoWidth', { configurable: true, value: 720 });
    Object.defineProperty(video!, 'videoHeight', { configurable: true, value: 1280 });
    video!.dispatchEvent(new Event('loadedmetadata'));

    expect(await waitFor(() => host.querySelector('.media-preview-stage[data-media-orientation="portrait"]'))).toBeTruthy();
    expect(video!.classList.contains('is-portrait')).toBe(true);
    expect(video!.hasAttribute('controls')).toBe(true);
  });
});
