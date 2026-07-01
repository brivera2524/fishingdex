import { useEffect, useState } from "react";
import { createComment, deleteComment, getComments, updateComment } from "../api/endpoints";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Comment } from "../api/types";

interface CommentThreadProps {
  catchId: number;
}

export default function CommentThread({ catchId }: CommentThreadProps) {
  const { currentUser } = useAuth();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newBody, setNewBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    getComments(catchId)
      .then(setComments)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load comments"));
  }, [catchId]);

  async function handlePost() {
    const body = newBody.trim();
    if (!body) return;
    setPosting(true);
    setError(null);
    try {
      const created = await createComment(catchId, body);
      setComments((prev) => [...(prev ?? []), created]);
      setNewBody("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  }

  function startEdit(comment: Comment) {
    setEditingId(comment.id);
    setEditBody(comment.body);
    setConfirmingDeleteId(null);
  }

  async function saveEdit(commentId: number) {
    const body = editBody.trim();
    if (!body) return;
    setBusyId(commentId);
    try {
      const updated = await updateComment(commentId, body);
      setComments((prev) => prev?.map((c) => (c.id === commentId ? updated : c)) ?? null);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update comment");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(commentId: number) {
    setBusyId(commentId);
    try {
      await deleteComment(commentId);
      setComments((prev) => prev?.filter((c) => c.id !== commentId) ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete comment");
    } finally {
      setBusyId(null);
      setConfirmingDeleteId(null);
    }
  }

  return (
    <div className="comment-thread">
      <p className="section-label">Comments</p>

      <div className="form" style={{ marginBottom: 14 }}>
        <textarea
          placeholder="Add a comment..."
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
        />
        <button type="button" onClick={handlePost} disabled={posting || !newBody.trim()}>
          {posting ? "Posting..." : "Post comment"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {comments == null && <p>Loading...</p>}
      {comments != null && comments.length === 0 && <p className="card-meta">No comments yet.</p>}

      <ul className="catch-list">
        {comments?.map((c) => (
          <li key={c.id} className="card">
            <div className="page-header">
              <span className="card-title">{c.display_name}</span>
              <span className="card-meta">
                {new Date(c.created_at).toLocaleString()}
                {c.updated_at && " (edited)"}
              </span>
            </div>

            {editingId === c.id ? (
              <div className="form">
                <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} />
                <div className="catch-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setEditingId(null)}
                    disabled={busyId === c.id}
                  >
                    Cancel
                  </button>
                  <button type="button" onClick={() => saveEdit(c.id)} disabled={busyId === c.id || !editBody.trim()}>
                    {busyId === c.id ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <p>{c.body}</p>
            )}

            {currentUser?.id === c.user_id && editingId !== c.id && (
              <>
                {confirmingDeleteId === c.id ? (
                  <div className="catch-actions">
                    <span className="confirm-label">Delete this comment?</span>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => handleDelete(c.id)}
                      disabled={busyId === c.id}
                    >
                      {busyId === c.id ? "Deleting..." : "Yes, delete"}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setConfirmingDeleteId(null)}
                      disabled={busyId === c.id}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="catch-actions">
                    <button type="button" className="secondary-button" onClick={() => startEdit(c)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => setConfirmingDeleteId(c.id)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
