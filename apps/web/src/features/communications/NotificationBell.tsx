import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Circle, Inbox, LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { apiRequest } from "../../lib/api";

type Notification = {
  id: string;
  title: string;
  description: string;
  type: "INFO" | "WARNING" | "SUCCESS" | "ERROR";
  priority: "NORMAL" | "HIGH" | "URGENT";
  route: string | null;
  sourceType: string | null;
  sourceId: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationData = {
  notifications: Notification[];
  unreadCount: number;
};

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (absolute < 60) return formatter.format(seconds, "second");
  if (absolute < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absolute < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiRequest<NotificationData>("/notifications"),
    refetchInterval: open ? 15_000 : 60_000,
  });

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && panelRef.current && !panelRef.current.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const update = useMutation({
    mutationFn: (body: { markAllRead: true } | { id: string; read: boolean }) => apiRequest<{ updated: boolean }>("/notifications", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const items = notifications.data?.notifications ?? [];
  const unreadCount = notifications.data?.unreadCount ?? 0;

  const openNotification = (item: Notification) => {
    if (!item.readAt) update.mutate({ id: item.id, read: true });
    if (item.route) {
      navigate(item.route);
      setOpen(false);
    }
  };

  return <div className="notification-bell" ref={panelRef}>
    <button className="icon-button notification-trigger" aria-label="Notifications" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <Bell size={18} />
      {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </button>

    {open && <div className="notification-panel glass-surface">
      <div className="notification-panel-head">
        <div><span className="eyebrow">NOTIFICATIONS</span><strong>{unreadCount > 0 ? `${unreadCount} unread` : "You're up to date"}</strong></div>
        {unreadCount > 0 && <button disabled={update.isPending} onClick={() => update.mutate({ markAllRead: true })}><CheckCheck size={15} /> Mark all read</button>}
      </div>

      {notifications.isLoading ? <div className="notification-state"><LoaderCircle className="spin" size={20} /><span>Loading notifications…</span></div>
        : notifications.error ? <div className="notification-state error"><Inbox size={20} /><span>{(notifications.error as Error).message}</span><button onClick={() => notifications.refetch()}>Retry</button></div>
        : items.length === 0 ? <div className="notification-state"><Inbox size={23} /><strong>No notifications yet</strong><span>New operational updates will appear here.</span></div>
        : <div className="notification-list">{items.slice(0, 20).map((item) => <button className={`notification-item ${item.readAt ? "read" : "unread"}`} key={item.id} onClick={() => openNotification(item)}>
          <span className={`notification-dot priority-${item.priority.toLowerCase()}`}>{!item.readAt && <Circle size={7} fill="currentColor" />}</span>
          <span className="notification-copy"><strong>{item.title}</strong><span>{item.description}</span><small>{relativeTime(item.createdAt)}{item.priority !== "NORMAL" ? ` · ${item.priority.toLowerCase()}` : ""}</small></span>
          <span className="notification-read-action" role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); update.mutate({ id: item.id, read: Boolean(!item.readAt) }); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); update.mutate({ id: item.id, read: Boolean(!item.readAt) }); } }}>{item.readAt ? "Unread" : "Read"}</span>
        </button>)}</div>}
    </div>}
  </div>;
}
