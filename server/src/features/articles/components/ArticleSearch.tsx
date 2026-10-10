import { useEffect, useState } from 'react';

export function ArticleSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onChange(draft), 300);
    return () => window.clearTimeout(timer);
  }, [draft, onChange, value]);

  return (
    <div className="article-search-field">
      <input
        aria-label="搜索文章"
        maxLength={120}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="搜索标题、摘要、正文、分类或标签"
        value={draft}
      />
      {draft ? (
        <button aria-label="清除搜索" onClick={() => setDraft('')} type="button">
          &times;
        </button>
      ) : null}
    </div>
  );
}
