import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import brandAvatar from '../assets/haruhi-avatar.png';
import { MarkdownContent } from '../components/MarkdownContent';
import { ImageWithFallback } from '../components/shared';
import { usePageMetadata } from '../hooks/usePageMetadata';
import { AboutProfile, isAboutProfileEmpty } from '../lib/about';
import { getAboutProfile } from '../lib/aboutApi';

function BrandAvatar({ name }: { name: string }) {
  return <img alt={name ? `${name} 的头像` : 'Kitepop 品牌头像'} className="about-avatar" src={brandAvatar} />;
}

export function AboutPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<AboutProfile | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const pageRef = useRef<HTMLElement>(null);
  const metadata = useMemo(
    () => ({
      title: '关于我 | Kitepop SOS',
      description: profile?.intro.trim() || '了解 Kitepop 的个人介绍、身份与创作记录。',
      path: '/about' as const,
      schemaType: 'ProfilePage' as const,
      subjectName: profile?.displayName.trim() || 'Kitepop'
    }),
    [profile?.displayName, profile?.intro]
  );
  usePageMetadata(null, metadata);

  const loadProfile = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError('');
    try {
      const nextProfile = await getAboutProfile(controller.signal);
      if (activeRequest.current !== controller || controller.signal.aborted) return;
      setProfile(nextProfile);
    } catch (loadError) {
      if (activeRequest.current !== controller || controller.signal.aborted || (loadError instanceof DOMException && loadError.name === 'AbortError')) {
        return;
      }
      setProfile(null);
      setError(loadError instanceof Error ? loadError.message : '获取个人资料失败，请稍后重试');
    } finally {
      if (activeRequest.current !== controller || controller.signal.aborted) return;
      activeRequest.current = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
    return () => activeRequest.current?.abort();
  }, [loadProfile]);

  useEffect(() => {
    const page = pageRef.current;
    if (!page || !profile || isAboutProfileEmpty(profile)) return;
    const hero = page.querySelector<HTMLElement>('.about-hero');
    const contentBlocks = [...page.querySelectorAll<HTMLElement>('.about-content > *')];
    const revealTargets = [...(hero ? [hero] : []), ...contentBlocks];
    revealTargets.forEach((target, index) => {
      target.classList.add('about-reveal');
      target.style.setProperty('--about-reveal-delay', `${Math.max(0, index - 1) * 80}ms`);
    });
    const canObserve = typeof IntersectionObserver === 'function';
    const reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!canObserve || reduceMotion) {
      revealTargets.forEach((target) => target.classList.add('is-revealed'));
      return () => revealTargets.forEach((target) => {
        target.classList.remove('about-reveal', 'is-revealed');
        target.style.removeProperty('--about-reveal-delay');
      });
    }

    revealTargets.forEach((target) => target.classList.add('is-reveal-pending'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove('is-reveal-pending');
        entry.target.classList.add('is-revealed');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    revealTargets.forEach((target) => observer.observe(target));
    return () => {
      revealTargets.forEach((target) => {
        observer.unobserve(target);
        target.classList.remove('about-reveal', 'is-reveal-pending', 'is-revealed');
        target.style.removeProperty('--about-reveal-delay');
      });
      observer.disconnect();
    };
  }, [profile]);

  useEffect(() => {
    const page = pageRef.current;
    if (!page || !profile || isAboutProfileEmpty(profile) || typeof window.matchMedia !== 'function') return;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!finePointer.matches || reduceMotion.matches) return;

    let frameId: number | null = null;
    let latestPointer: { x: number; y: number } | null = null;
    const resetParallax = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      latestPointer = null;
      page.style.setProperty('--about-parallax-x', '0');
      page.style.setProperty('--about-parallax-y', '0');
    };
    const renderParallax = () => {
      frameId = null;
      if (!latestPointer) return;
      const bounds = page.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return resetParallax();
      const x = Math.max(-1, Math.min(1, ((latestPointer.x - bounds.left) / bounds.width - 0.5) * 2));
      const y = Math.max(-1, Math.min(1, ((latestPointer.y - bounds.top) / bounds.height - 0.5) * 2));
      page.style.setProperty('--about-parallax-x', String(Number(x.toFixed(3))));
      page.style.setProperty('--about-parallax-y', String(Number(y.toFixed(3))));
    };
    const queueParallax = (event: PointerEvent) => {
      latestPointer = { x: event.clientX, y: event.clientY };
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(renderParallax);
    };

    resetParallax();
    page.addEventListener('pointermove', queueParallax, { passive: true });
    page.addEventListener('pointerleave', resetParallax);
    return () => {
      page.removeEventListener('pointermove', queueParallax);
      page.removeEventListener('pointerleave', resetParallax);
      resetParallax();
    };
  }, [profile]);

  if (loading) {
    return <section className="about-page" ref={pageRef}><p role="status">正在加载个人资料…</p></section>;
  }

  if (error) {
    return (
      <section className="about-page" ref={pageRef}>
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => void loadProfile()} type="button">重试</button>
        </div>
      </section>
    );
  }

  if (!profile || isAboutProfileEmpty(profile)) {
    return <section className="about-page" ref={pageRef}><p role="status">个人资料还在准备中，晚些时候再来看看吧。</p></section>;
  }

  return (
    <section className="about-page" aria-labelledby={profile.displayName ? 'about-profile-heading' : undefined} ref={pageRef}>
      <section className="about-hero about-reveal">
        <span aria-hidden="true" className="about-sos-watermark">SOS</span>
        <span aria-hidden="true" className="about-poster-mark">PERSONAL FILE / KITEPOP</span>
        <div className="about-avatar-parallax">
          <div className="about-avatar-ring">
            <ImageWithFallback
              alt={profile.displayName ? `${profile.displayName} 的头像` : '个人头像'}
              className="about-avatar"
              fallback={<BrandAvatar name={profile.displayName} />}
              src={profile.avatarUrl}
            />
          </div>
        </div>
        {profile.displayName ? <h1 className="about-profile-name" id="about-profile-heading">{profile.displayName}</h1> : null}
        {profile.identityTags.length ? (
          <div className="about-identity-tags" aria-label="身份标签">
            {profile.identityTags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        ) : null}
        {profile.intro ? <p>{profile.intro}</p> : null}
        {profile.githubUrl ? (
          <a aria-label={`${profile.displayName} 的 GitHub`} className="about-social-link" href={profile.githubUrl} rel="noopener noreferrer" target="_blank">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.02c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.28-5.27-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.47.11-3.05 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.19-1.49 3.15-1.18 3.15-1.18.63 1.58.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" /></svg>
            <span>GitHub</span>
          </a>
        ) : null}
      </section>
      {profile.content ? (
        <article className="about-content">
          <MarkdownContent content={profile.content} />
        </article>
      ) : null}
    </section>
  );
}
