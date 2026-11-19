import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MessageCircle, MoreVertical, Pin, ThumbsDown, ThumbsUp } from "lucide-react";
import { Sheet } from "./Layer";
import { ProfileAvatar } from "./ProfileAvatar";
import { MAX_COMMENT, addComment, ago, deleteComment, editComment, threads, togglePin, voteComment, type CommentSort, type Thread } from "@/lib/comments";
import { useUser } from "@/lib/store/user";
import type { CommentRecord } from "@/lib/store/db";
import type { Title } from "@/lib/titles";

/**
 * Chapter comments, modelled on the blueprint's comment screen: Top / Newest,
 * a TOP pill, replies, thumbs, a ⋮ menu and an emoji + "Leave a comment"
 * composer pinned to the bottom. Everything stays on this device (D5).
 */

const EMOJI = ["😂", "😭", "😍", "😱", "🔥", "👏"];

export interface CommentTarget {
  title: Title;
  chapterId: string;
  chapterNumber?: number;
}

export function Composer({
  target,
  parentId,
  onDone,
  autoFocus,
  initial,
  onSubmit,
  placeholder = "Leave a comment",
}: {
  target?: CommentTarget;
  parentId?: string;
  onDone?: () => void;
  autoFocus?: boolean;
  initial?: string;
  onSubmit?: (body: string) => Promise<unknown>;
  placeholder?: string;
}) {
  const [body, setBody] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => ref.current?.focus());
  }, [autoFocus]);
  const left = MAX_COMMENT - body.length;
  const submit = async () => {
    if (!body.trim() || busy) return;
    const text = body;
    setBusy(true);
    setBody(""); // clear at once; the text comes back if saving fails
    try {
      if (onSubmit) await onSubmit(text);
      else if (target) await addComment({ ...target, body: text, parentId });
      onDone?.();
    } catch {
      setBody(text);
    } finally {
      setBusy(false);
    }
  };
  const insert = (e: string) => {
    const el = ref.current;
    const at = el?.selectionStart ?? body.length;
    const next = (body.slice(0, at) + e + body.slice(el?.selectionEnd ?? at)).slice(0, MAX_COMMENT);
    setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + e.length, at + e.length);
    });
  };
  return (
    <form
      className="cm-composer"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="cm-emoji" role="group" aria-label="Add an emoji">
        {EMOJI.map((e) => (
          <button key={e} type="button" onClick={() => insert(e)} aria-label={`Add ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="cm-input">
        <label htmlFor={id} className="sr-only">
          {placeholder}
        </label>
        <textarea
          id={id}
          ref={ref}
          rows={1}
          value={body}
          maxLength={MAX_COMMENT}
          placeholder={placeholder}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button className="btn btn-primary btn-sm" type="submit" disabled={!body.trim() || busy}>
          {initial !== undefined ? "Save" : parentId ? "Reply" : "Post"}
        </button>
      </div>
      {left <= 80 && (
        <p className="cm-left" aria-live="polite">
          {left} characters left
        </p>
      )}
    </form>
  );
}

function CommentMenu({ c, onEdit }: { c: CommentRecord; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && (setOpen(false), setConfirm(false));
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className="cm-menu" ref={ref}>
      <button className="icon-btn" aria-label="Comment options" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreVertical size={18} />
      </button>
      {open && (
        <div className="cm-pop" role="menu">
          {confirm ? (
            <>
              <p className="cm-pop-q">Delete this comment{c.parentId ? "" : " and its replies"}?</p>
              <button role="menuitem" className="danger" onClick={() => void deleteComment(c)}>
                Delete
              </button>
              <button role="menuitem" onClick={() => (setConfirm(false), setOpen(false))}>
                Keep it
              </button>
            </>
          ) : (
            <>
              {!c.parentId && (
                <button role="menuitem" onClick={() => (setOpen(false), void togglePin(c))}>
                  {c.pinned ? "Unpin from Top" : "Pin to Top"}
                </button>
              )}
              <button role="menuitem" onClick={() => (setOpen(false), onEdit())}>
                Edit
              </button>
              <button role="menuitem" className="danger" onClick={() => setConfirm(true)}>
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CommentRow({ c, target, replies, reply }: { c: CommentRecord; target: CommentTarget; replies?: CommentRecord[]; reply?: boolean }) {
  const profile = useUser((s) => s.profile);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [showReplies, setShowReplies] = useState(false);
  if (!profile) return null;
  return (
    <li className={`cm ${reply ? "cm-reply" : ""}`}>
      <ProfileAvatar profile={profile} size={reply ? 28 : 36} />
      <div className="cm-main">
        <div className="cm-head">
          <span className="cm-name">{profile.name}</span>
          <time className="cm-time" dateTime={new Date(c.at).toISOString()}>
            {ago(c.at)}
            {c.editedAt ? " · edited" : ""}
          </time>
          {c.pinned && (
            <span className="cm-top">
              <Pin size={10} aria-hidden="true" /> TOP
            </span>
          )}
          <CommentMenu c={c} onEdit={() => setEditing(true)} />
        </div>
        {editing ? <Composer initial={c.body} autoFocus placeholder="Edit comment" onSubmit={(b) => editComment(c, b)} onDone={() => setEditing(false)} /> : <p className="cm-body">{c.body}</p>}
        <div className="cm-actions">
          {!reply && (
            <button className="cm-act" aria-expanded={showReplies || replying} onClick={() => (replies?.length ? setShowReplies((s) => !s) : setReplying(true))}>
              <MessageCircle size={15} aria-hidden="true" /> {replies?.length ? `Replies ${replies.length}` : "Reply"}
            </button>
          )}
          <span className="cm-spacer" />
          <button className="cm-act" aria-pressed={c.vote === 1} aria-label="Thumbs up" onClick={() => void voteComment(c, 1)}>
            <ThumbsUp size={15} aria-hidden="true" /> {c.vote === 1 ? 1 : 0}
          </button>
          <button className="cm-act" aria-pressed={c.vote === -1} aria-label="Thumbs down" onClick={() => void voteComment(c, -1)}>
            <ThumbsDown size={15} aria-hidden="true" /> {c.vote === -1 ? 1 : 0}
          </button>
        </div>
        {!reply && (showReplies || replying) && (
          <div className="cm-thread">
            {replies && replies.length > 0 && (
              <ul className="cm-list">
                {replies.map((r) => (
                  <CommentRow key={r.id} c={r} target={target} reply />
                ))}
              </ul>
            )}
            {replying ? (
              <Composer target={target} parentId={c.id} autoFocus placeholder="Write a reply" onDone={() => (setReplying(false), setShowReplies(true))} />
            ) : (
              <button className="cm-act" onClick={() => setReplying(true)}>
                Reply
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function CommentList({ list, target, limit }: { list: Thread[]; target: CommentTarget; limit?: number }) {
  return (
    <ul className="cm-list">
      {list.slice(0, limit).map((t) => (
        <CommentRow key={t.comment.id} c={t.comment} replies={t.replies} target={target} />
      ))}
    </ul>
  );
}

export function CommentsSheet({ open, onClose, target, items, compose }: { open: boolean; onClose: () => void; target?: CommentTarget; items: CommentRecord[]; compose?: boolean }) {
  const [sort, setSort] = useState<CommentSort>("top");
  const list = useMemo(() => threads(items, sort), [items, sort]);
  return (
    <Sheet open={open} onClose={onClose} title={`Comments (${items.length})`} wide>
      {target && (
        <div className="cm-sheet">
          <div className="cm-tabs" role="tablist" aria-label="Sort comments">
            {(["top", "newest"] as const).map((s) => (
              <button key={s} role="tab" aria-selected={sort === s} onClick={() => setSort(s)}>
                {s === "top" ? "Top" : "Newest"}
              </button>
            ))}
          </div>
          <p className="cm-note">Comments are private notes on this device, saved with your profile and included in exports.</p>
          {list.length ? <CommentList list={list} target={target} /> : <p className="cm-empty">No comments on this chapter yet. What stood out to you?</p>}
          <div className="cm-foot">
            <Composer target={target} autoFocus={compose} />
          </div>
        </div>
      )}
    </Sheet>
  );
}
