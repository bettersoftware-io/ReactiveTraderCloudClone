# Privacy notice

Reactive Trader Cloud Clone is a demonstration project. Demo accounts store
nothing about you. This notice covers **registered accounts** only.

## What is stored

| Data | Why |
|---|---|
| Your email address | To confirm the account is yours, to send a password-reset code, and as your sign-in name |
| Your display name | Shown in the app's profile menu, and to the administrator who approves the account |
| When the account was created, and whether it is confirmed, approved or blocked | To run the approval step |
| A hash of your password | Held by Supabase Auth. The password is chosen when you enter the emailed code; the project's own code passes it to Supabase in that one request and never stores or logs it |
| A record of each sign-in session | Kept by Supabase Auth, which stores it with an IP address and a client identification. The client is the project's server, not your browser: the server forwards your IP address but not your browser's identification |

Apart from these and the assistant's messages (below), nothing is collected.
There is no tracking and no advertising. Trades and prices in the app are
simulated and are not kept.

After you sign in, your browser keeps the session token the server issued.
That token carries your email address and expires after eight hours by
default. Signing out removes it.

## The Jarvis assistant

When you are signed in to the live desk, the Jarvis assistant can answer with
a model from Anthropic. When it does, the text of your message, the recent
conversation (a capped number of earlier messages) and the results of the desk
tools it calls (simulated prices, trades and analytics) are sent to the
Anthropic API to produce the answer. Your email address and display name
are not sent. Anthropic's own data retention applies to what it receives.
The scripted assistant sends nothing anywhere.

The server keeps the conversation in memory only for as long as your
connection is open, and does not store or log message contents. It counts
turns and tokens per model for the whole server, not per person.

## Where

In a Supabase project hosted in London (United Kingdom). Emails are sent
through the email provider configured in that project, which sees your
address and the code it carries.

## How long, and how to delete it

The account is kept until you ask for it to be deleted. To delete it, write to
<privacy@bettersoftware.io> from the account's own address. If you would
rather not email, open an issue at
<https://github.com/bettersoftware-io/ReactiveTraderCloudClone/issues>
asking for account deletion **without naming your address** (issues are
public); the maintainer will ask you to confirm from the account's address.
Deletion removes the account and its profile. An account whose address is
never confirmed is deleted after 48 hours.

## Logs

The server never logs an email address, a password, a code, a session token
or the contents of a request. It logs an IP address in two cases: when it
bans that address for repeated failures (with the reason, such as failed
sign-ins or wrong codes), and when a request fails with a server error.

The server passes your IP address on to Supabase with each account request,
so that Supabase's own abuse limits apply to you rather than to the server.
Supabase's authentication logs may record it.
