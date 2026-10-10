import { formatBytes } from './shared';
import { UploadProgress } from '../lib/uploadProgress';

interface UploadProgressTipProps {
  fileName: string;
  hidden: boolean;
  onClose: () => void;
  progress: UploadProgress | null;
  title: string;
}

export function UploadProgressTip({ fileName, hidden, onClose, progress, title }: UploadProgressTipProps) {
  const percent = progress?.percent ?? 0;
  const loaded = progress?.loaded ?? 0;
  const total = progress?.total ?? 0;
  const speed = progress?.speedBytesPerSecond ?? 0;

  return (
    <aside aria-live="polite" className={hidden ? 'upload-progress-tip hidden' : 'upload-progress-tip'}>
      <button aria-label="关闭上传提示" onClick={onClose} type="button">
        x
      </button>
      <span className="upload-progress-kicker">{title}</span>
      <strong title={fileName}>{fileName}</strong>
      <div className="upload-progress-bar" aria-label={`上传进度 ${percent}%`}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="upload-progress-meta">
        <span>{percent}%</span>
        <span>
          {formatBytes(loaded)} / {total ? formatBytes(total) : '计算中'}
        </span>
        <span>{speed > 0 ? `${formatBytes(speed)}/s` : '准备上传'}</span>
      </div>
    </aside>
  );
}
