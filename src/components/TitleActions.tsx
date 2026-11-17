import { useNavigate } from "react-router-dom";
import { BookmarkPlus, BookmarkCheck, EyeOff, Heart, Sparkles, ThumbsDown, Share2 } from "lucide-react";
import { getUser, hideTitle, setStatus, signal, toggleFavorite, unhideTitle, useUser } from "@/lib/store/user";
import { haptic, share } from "@/lib/platform";
import { titlePath, type Title } from "@/lib/titles";
import { SITE_URL } from "@/lib/seo";
import { Sheet } from "./Layer";
import { toast } from "./Toast";

export function similarPath(t: Title) {
  return `/search?similar=${encodeURIComponent(t.key)}&q=${encodeURIComponent(`similar to ${t.title}`)}`;
}

/** Long-press / overflow menu for a title in any feed. Every item performs a real action. */
export function TitleActionsSheet({ title, open, onClose, context }: { title: Title; open: boolean; onClose: () => void; context?: string }) {
  const nav = useNavigate();
  const lib = useUser((s) => s.library.get(title.key));
  const close = () => onClose();
  const hide = async (reason: "not_interested" | "hide") => {
    close();
    await hideTitle(title, reason);
    void haptic("light");
    toast(reason === "hide" ? `Hidden "${title.title}"` : "Got it. You'll see fewer like this.", { label: "Undo", run: () => void unhideTitle(title.key) });
  };
  return (
    <Sheet open={open} onClose={close} title={title.title}>
      <div className="menu-list">
        <button
          className="menu-item"
          onClick={async () => {
            close();
            if (lib?.status) {
              await setStatus(title, undefined);
              toast("Removed from library");
            } else {
              await setStatus(title, "plan");
              void haptic("success");
              toast("Added to Plan to read", { label: "Undo", run: () => void setStatus(title, undefined) });
            }
          }}
        >
          {lib?.status ? <BookmarkCheck size={20} /> : <BookmarkPlus size={20} />}
          <span>{lib?.status ? "Remove from library" : "Add to library"}</span>
        </button>
        <button
          className="menu-item"
          onClick={async () => {
            close();
            await toggleFavorite(title);
            toast(getUser().library.get(title.key)?.favorite ? "Added to favourites" : "Removed from favourites");
          }}
        >
          <Heart size={20} />
          <span>{lib?.favorite ? "Remove from favourites" : "Favourite"}</span>
        </button>
        <button
          className="menu-item"
          onClick={async () => {
            close();
            await signal("more_like_this", title, title.key, { context });
            nav(similarPath(title));
          }}
        >
          <Sparkles size={20} />
          <span>
            More like this
            <small>Find similar titles and show more of this kind</small>
          </span>
        </button>
        <button className="menu-item" onClick={() => void hide("not_interested")}>
          <ThumbsDown size={20} />
          <span>
            Not interested
            <small>Hide it and recommend fewer like it</small>
          </span>
        </button>
        <button className="menu-item" onClick={() => void hide("hide")}>
          <EyeOff size={20} />
          <span>
            Hide this title
            <small>Remove it from your feeds. Undo in Profile, Hidden titles</small>
          </span>
        </button>
        <button
          className="menu-item"
          onClick={async () => {
            close();
            const r = await share({ title: title.title, url: `${SITE_URL}${titlePath(title)}` });
            if (r === "copied") toast("Link copied");
            if (r === "failed") toast("Couldn't share this link");
          }}
        >
          <Share2 size={20} />
          <span>Share</span>
        </button>
      </div>
    </Sheet>
  );
}
