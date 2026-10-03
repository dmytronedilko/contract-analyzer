'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { CopyButton } from '@/components/analysis/copy-button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { authClient } from '@/lib/auth-client';
import { can } from '@/lib/permissions';
import { isRole, ROLES, type Role } from '@repo/contracts';

interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
}

interface InvitationRow {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** Roles a user may assign: admins can't create or promote owners. */
function assignableRoles(currentRole: Role): Role[] {
  return currentRole === 'owner' ? [...ROLES] : ROLES.filter((role) => role !== 'owner');
}

export function OrganizationSettings({
  organization,
  currentUserId,
  currentRole,
  appUrl,
  members,
  invitations,
}: {
  organization: { id: string; name: string };
  currentUserId: string;
  currentRole: Role;
  appUrl: string;
  members: MemberRow[];
  invitations: InvitationRow[];
}) {
  const router = useRouter();
  const roles = assignableRoles(currentRole);
  // Better Auth refuses to let the last owner leave; say so up front instead of after a click.
  const isLastOwner =
    currentRole === 'owner' && members.filter((member) => member.role === 'owner').length === 1;

  /** Runs a Better Auth call, reports its error, and refreshes the server-rendered data. */
  async function run(action: () => Promise<{ error: { message?: string } | null }>, done: string) {
    const { error } = await action();
    if (error) {
      toast.error(error.message ?? 'That didn’t work. Try again.');
      return false;
    }
    toast.success(done);
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Members of {organization.name}</CardTitle>
          <CardDescription>Roles take effect on the member&apos;s next request.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const isSelf = member.userId === currentUserId;
                // Admins can't change or remove owners; nobody edits themselves here.
                const editable = !isSelf && (currentRole === 'owner' || member.role !== 'owner');
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      {member.name}
                      {isSelf ? <span className="text-muted-foreground"> (you)</span> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{member.email}</TableCell>
                    <TableCell>
                      {editable ? (
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            void run(
                              () =>
                                authClient.organization.updateMemberRole({
                                  memberId: member.id,
                                  role,
                                }),
                              'Role updated',
                            )
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-32"
                            aria-label={`Role of ${member.name}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.map((role) => (
                              <SelectItem key={role} value={role}>
                                {role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        member.role
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editable ? (
                        <ConfirmButton
                          label="Remove"
                          title={`Remove ${member.name}?`}
                          description="They lose access immediately. Their uploaded documents stay in the organization."
                          onConfirm={() =>
                            run(
                              () =>
                                authClient.organization.removeMember({
                                  memberIdOrEmail: member.id,
                                }),
                              'Member removed',
                            )
                          }
                        />
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <InviteCard
        roles={roles}
        appUrl={appUrl}
        invitations={invitations}
        onInvite={(email, role) =>
          authClient.organization.inviteMember({ email, role, organizationId: organization.id })
        }
        onRevoke={(invitationId) =>
          run(
            () => authClient.organization.cancelInvitation({ invitationId }),
            'Invite link revoked',
          )
        }
        onChanged={() => router.refresh()}
      />

      <Card>
        <CardHeader>
          <CardTitle>Leave organization</CardTitle>
          <CardDescription>You lose access to its documents.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLastOwner ? (
            <p id="leave-blocked" className="text-sm text-muted-foreground">
              You&apos;re the only owner, so you can&apos;t leave. Make another member an owner
              first
              {can(currentRole, 'organization:delete') ? ', or delete the organization below' : ''}.
            </p>
          ) : null}
          <ConfirmButton
            label="Leave organization"
            disabled={isLastOwner}
            {...(isLastOwner ? { describedBy: 'leave-blocked' } : {})}
            title={`Leave ${organization.name}?`}
            description="You'll need a new invitation to come back."
            onConfirm={async () => {
              const { error } = await authClient.organization.leave({
                organizationId: organization.id,
              });
              if (error) {
                toast.error(error.message ?? 'You couldn’t leave the organization.');
                return;
              }
              window.location.assign('/onboarding');
            }}
          />
        </CardContent>
      </Card>

      {can(currentRole, 'organization:delete') ? (
        <DeleteOrganizationCard organization={organization} />
      ) : null}
    </div>
  );
}

function ConfirmButton({
  label,
  title,
  description,
  onConfirm,
  disabled = false,
  describedBy,
}: {
  label: string;
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
  disabled?: boolean;
  /** Id of the text explaining why the button is disabled. */
  describedBy?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} aria-describedby={describedBy}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()}>{label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function InviteCard({
  roles,
  appUrl,
  invitations,
  onInvite,
  onRevoke,
  onChanged,
}: {
  roles: Role[];
  appUrl: string;
  invitations: InvitationRow[];
  onInvite: (
    email: string,
    role: Role,
  ) => Promise<{ data: { id: string } | null; error: { message?: string } | null }>;
  onRevoke: (invitationId: string) => Promise<unknown>;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [pending, setPending] = useState(false);
  const linkFor = (id: string) => `${appUrl}/invite/${id}`;

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const { error } = await onInvite(email.trim(), role);
    setPending(false);
    if (error) {
      toast.error(error.message ?? 'The invitation could not be created.');
      return;
    }
    toast.success('Invite link created. Copy it and send it to them.');
    setEmail('');
    onChanged();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite links</CardTitle>
        <CardDescription>
          No email is sent: share the link yourself. It expires after 7 days and only works for the
          invited email address.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={(event) => void invite(event)} className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) => {
                if (isRole(value)) setRole(value);
              }}
            >
              <SelectTrigger id="invite-role" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={pending || !email.trim()}>
            Create invite link
          </Button>
        </form>

        {invitations.length ? (
          <ul className="space-y-2">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <span>
                  {invitation.email} · {invitation.role} · expires{' '}
                  {dateFormat.format(new Date(invitation.expiresAt))}
                </span>
                <span className="flex gap-1">
                  <CopyButton
                    text={linkFor(invitation.id)}
                    label={`Copy invite link for ${invitation.email}`}
                  />
                  <Button size="sm" variant="ghost" onClick={() => void onRevoke(invitation.id)}>
                    Revoke
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        )}
      </CardContent>
    </Card>
  );
}

function DeleteOrganizationCard({ organization }: { organization: { id: string; name: string } }) {
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    const { error } = await authClient.organization.delete({ organizationId: organization.id });
    setPending(false);
    if (error) {
      toast.error(error.message ?? 'The organization could not be deleted.');
      return;
    }
    window.location.assign('/onboarding');
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle>Delete organization</CardTitle>
        <CardDescription>
          Permanently deletes the organization, its documents, their excerpts and its audit log.
          This can&apos;t be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="delete-confirmation">
          Type <span className="font-mono">{organization.name}</span> to confirm
        </Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="delete-confirmation"
            className="max-w-xs"
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <Button
            variant="destructive"
            disabled={pending || confirmation !== organization.name}
            onClick={() => void remove()}
          >
            Delete organization
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
