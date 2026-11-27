-- Creating an account no longer requires a separate email verification step.
-- Accounts that were waiting for a verification link become usable at once.
UPDATE console_users
SET email_verified=true,confirm_selector='',confirm_verifier=''
WHERE NOT email_verified;
