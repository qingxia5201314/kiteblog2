import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ParallaxStage } from './effects/ParallaxStage';
import { TiltCard } from './effects/TiltCard';

describe('visual effect wrappers', () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => root.unmount());
    document.body.innerHTML = '';
  });

  it('renders tilt and parallax wrappers without owning feature state', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    roots.push(root);

    await act(async () => {
      root.render(
        <ParallaxStage className="hero-depth">
          <TiltCard className="post-depth">文章卡片</TiltCard>
        </ParallaxStage>
      );
    });

    expect(host.querySelector('.parallax-stage.hero-depth')).toBeTruthy();
    expect(host.querySelector('.tilt-card.post-depth')?.textContent).toBe('文章卡片');
  });
});
