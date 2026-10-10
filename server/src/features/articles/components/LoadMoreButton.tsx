export function LoadMoreButton({
  hasMore,
  loading,
  error,
  onLoadMore,
  onRetry
}: {
  hasMore: boolean;
  loading: boolean;
  error: string;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="article-page-action article-page-error" role="status">
        <span>{error}</span>
        <button onClick={onRetry} type="button">重试</button>
      </div>
    );
  }
  if (!hasMore) return <p className="article-page-end">已经到底了</p>;
  return (
    <div className="article-page-action">
      <button disabled={loading} onClick={onLoadMore} type="button">
        {loading ? '正在加载...' : '加载更多'}
      </button>
    </div>
  );
}
