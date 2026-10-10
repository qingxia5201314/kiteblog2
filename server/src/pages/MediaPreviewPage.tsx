import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface MediaPreviewState {
  url: string;
  originalName: string;
  contentType: string;
}

function formatMediaKind(contentType: string) {
  if (contentType.startsWith('video/')) return '视频预览';
  if (contentType.startsWith('audio/')) return '音频预览';
  return '文件预览';
}

export function MediaPreviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || null) as MediaPreviewState | null;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activated, setActivated] = useState(false);
  const [orientation, setOrientation] = useState<'landscape' | 'portrait' | 'square'>('landscape');

  useEffect(() => {
    if (!state?.url) {
      navigate('/files', { replace: true });
    }
  }, [navigate, state]);

  const isVideo = useMemo(() => Boolean(state?.contentType?.startsWith('video/')), [state?.contentType]);
  const isAudio = useMemo(() => Boolean(state?.contentType?.startsWith('audio/')), [state?.contentType]);

  useEffect(() => {
    if (!isVideo || !activated) return;

    const video = videoRef.current;
    if (!video) return;

    const updateOrientation = () => {
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;
      if (!width || !height) return;
      if (width === height) {
        setOrientation('square');
        return;
      }
      setOrientation(width > height ? 'landscape' : 'portrait');
    };

    updateOrientation();
    video.addEventListener('loadedmetadata', updateOrientation);
    return () => video.removeEventListener('loadedmetadata', updateOrientation);
  }, [activated, isVideo]);

  if (!state?.url) return null;

  return (
    <section className="media-preview-page">
      <div className="media-preview-shell accounting-card">
        <div className="media-preview-header">
          <button className="ghost" onClick={() => navigate('/files')} type="button">
            返回文件仓库
          </button>
          <div>
            <p className="eyebrow">Public Media</p>
            <h1>{state.originalName}</h1>
            <p>{formatMediaKind(state.contentType)}</p>
          </div>
        </div>

        <div className={`media-preview-stage is-${orientation}`} data-media-orientation={orientation}>
          {isVideo ? (
            <div className="media-preview-player-wrap">
              <video
                ref={videoRef}
                className={`media-preview-player${orientation === 'portrait' ? ' is-portrait' : ''}`}
                controls={activated}
                controlsList="nodownload noplaybackrate"
                disablePictureInPicture
                draggable="false"
                playsInline
                preload="none"
                src={activated ? state.url : undefined}
              />
              {!activated ? (
                <div className="media-preview-overlay">
                  <button onClick={() => setActivated(true)} type="button">
                    播放视频
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {isAudio ? (
            <div className="media-preview-audio-card">
              <audio
                className="media-preview-player"
                controls={activated}
                controlsList="nodownload noplaybackrate"
                draggable="false"
                preload="none"
                src={activated ? state.url : undefined}
              />
              {!activated ? (
                <button onClick={() => setActivated(true)} type="button">
                  加载音频
                </button>
              ) : null}
            </div>
          ) : null}

          {activated ? (
            <div className="media-preview-controls" aria-label="媒体控制区">
              <span>{orientation === 'portrait' ? '竖屏布局' : orientation === 'square' ? '方形布局' : '横屏布局'}</span>
            </div>
          ) : (
            <div className="media-preview-controls is-standby" aria-label="媒体控制区">
              <button className="ghost" onClick={() => setActivated(true)} type="button">
                点击播放后加载媒体
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
