// A pending task is overdue once its deadline has passed
export function isOverdue(task: {
  status: string;
  dueAt: string | Date | null;
}): boolean {
  return (
    task.status === "pending" &&
    task.dueAt !== null &&
    new Date(task.dueAt).getTime() < Date.now()
  );
}
