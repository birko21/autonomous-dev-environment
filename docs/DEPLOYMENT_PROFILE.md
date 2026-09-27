# Deployment Profile

The repository implements the control-plane safeguards but does not create an OS sandbox. A production deployment must place the process in a dedicated container or VM with:

- a non-root user and read-only base image;
- the checkout and runtime state mounted only at explicitly required paths;
- runtime state outside the checkout, with encrypted storage and controlled backups;
- no host socket, unrestricted device, or broad home-directory mount;
- default-deny egress, allowing only approved provider and source-control endpoints;
- CPU, memory, process, file-size, wall-clock, and child-process limits;
- an external supervisor that terminates stuck workers and records exit status.

Set `ADE_REQUIRE_ISOLATION=true` after the deployment satisfies the external-sandbox requirement. The readiness command then blocks when `ADE_DATA_DIR` is inside `ADE_WORKSPACE`.

The application-level path guard is defense in depth. It is not a substitute for container, VM, operating-system, or network policy.
