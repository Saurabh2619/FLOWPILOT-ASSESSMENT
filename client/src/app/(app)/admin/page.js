"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, Empty, Loading, PageTitle } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, titleCase } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

const PAGE_SIZE = 20;

function Users() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const users = useResource(`/admin/users?page=${page}&limit=${PAGE_SIZE}`);
  const [actionError, setActionError] = useState(null);

  const setDisabled = async (target, disabled) => {
    const mark = (value) =>
      users.setData((data) => ({
        ...data,
        users: data.users.map((item) =>
          item.id === target.id ? { ...item, disabled: value } : item,
        ),
      }));
    setActionError(null);
    mark(disabled);
    try {
      await api(`/admin/users/${target.id}`, { method: "PATCH", body: { disabled } });
    } catch (error) {
      mark(target.disabled);
      setActionError(error.message);
    }
  };

  const pages = users.data ? Math.max(1, Math.ceil(users.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-4">
      <Alert onRetry={users.reload}>{users.error?.message}</Alert>
      <Alert>{actionError}</Alert>
      {users.loading && <Loading label="Loading users" />}
      {users.data?.users.length === 0 && <Empty title="No users on this page" />}
      <ul className="space-y-2">
        {users.data?.users.map((item) => (
          <li key={item.id}>
            <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.email}</p>
                <p className="text-sm text-zinc-500">Joined {formatDate(item.createdAt)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{titleCase(item.role)}</Badge>
                <Badge>{titleCase(item.plan)}</Badge>
                <Badge tone={item.disabled ? "bad" : "good"}>
                  {item.disabled ? "Disabled" : "Active"}
                </Badge>
                <Button
                  variant={item.disabled ? "secondary" : "danger"}
                  disabled={item.id === me.id}
                  onClick={() => setDisabled(item, !item.disabled)}
                >
                  {item.disabled ? "Enable" : "Disable"}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {users.data && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {pages} · {users.data.total} users
          </span>
          <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  return (
    <>
      <PageTitle title="Admin">List accounts and disable or enable them.</PageTitle>
      {user.role === "admin" ? <Users /> : <Alert>Only administrators can open this page.</Alert>}
    </>
  );
}
