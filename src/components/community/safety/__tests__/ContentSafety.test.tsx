import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const reportMutate = vi.fn(async () => {});
const blockMutate = vi.fn(async () => {});
let signedInAs: string | null = "me";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: signedInAs ? { id: signedInAs } : null }) }));
vi.mock("@/hooks/community/useCommunityExtras", () => ({
  useReport: () => ({ mutateAsync: reportMutate, isPending: false }),
}));
vi.mock("@/hooks/community/useBlocks", () => ({
  useBlockUser: () => ({ mutateAsync: blockMutate, isPending: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ContentActionsMenu } from "../ContentActionsMenu";

const openMenu = () => {
  const trigger = screen.getByRole("button", { name: /More actions for Ben's message/ });
  fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
  fireEvent.keyDown(trigger, { key: "Enter" });
};

describe("ContentActionsMenu", () => {
  beforeEach(() => {
    signedInAs = "me";
    reportMutate.mockClear();
    blockMutate.mockClear();
  });

  it("offers nothing on your own content, or when signed out", () => {
    const { rerender } = render(<ContentActionsMenu target={{ messageId: "m1" }} authorId="me" authorName="Me" />);
    expect(screen.queryByRole("button")).toBeNull();
    signedInAs = null;
    rerender(<ContentActionsMenu target={{ messageId: "m1" }} authorId="ben" authorName="Ben" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reports a message with the chosen reason and details", async () => {
    render(<ContentActionsMenu target={{ messageId: "m1" }} authorId="ben" authorName="Ben" />);
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Report/ }));

    const send = await screen.findByRole("button", { name: "Send report" });
    expect(send).toBeDisabled(); // a reason is required
    fireEvent.click(screen.getByLabelText("Harassment or bullying"));
    fireEvent.change(screen.getByLabelText("Details (optional)"), { target: { value: "  insults  " } });
    fireEvent.click(send);

    await waitFor(() => expect(reportMutate).toHaveBeenCalledWith({ messageId: "m1", reason: "harassment", notes: "insults" }));
  });

  it("blocks the author after confirming", async () => {
    render(<ContentActionsMenu target={{ messageId: "m1" }} authorId="ben" authorName="Ben" />);
    openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Block Ben" }));

    expect(await screen.findByText(/won't see their posts, comments or messages/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    await waitFor(() => expect(blockMutate).toHaveBeenCalledWith("ben"));
  });
});
