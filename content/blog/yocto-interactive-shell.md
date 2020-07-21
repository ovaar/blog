+++
date = "2020-07-20"
title = "Yocto interactive shell"
type = "post"
+++

## [Linux] yocto interactive shell

This post is about a feature request which I have implemented, at time of writing, about 2 years back. It always stuck with me because the project I was doing at the time was my first yocto experience. Topic has its own [BSP](https://github.com/topic-embedded-products/topic-platform) for FPGA boards on top of a Linux distribution. A custom board was specifically designed for a customor which would run our software that would interface with another custom low power embedded device.

Due to an increasing demand of delivering production ready devices to our customer, delivering actual software features became more and more challenging. Making the devices production ready required some manual steps and was something we did in-house.

1. Create a bootable SD card with a yocto image containing an [swupdate](https://github.com/sbabic/swupdate) package
2. Erase NOR-flash
3. Run swupdate and select the right boot partition 
4. Erase EEPROM
5. Write MAC address to EEPROM

This turned out to be error sensitive process. So I decided to create a script which restricts the user input and does validation on the MAC address. Also it could flash the swupdate package, erase flash, write to EEPROM, erase the EEPROM and would prompt the user to select the boot partition to write the swupdate package to. Now I had the script, but still I needed to enter user credentials every time I booted from the SD-card. Would it not be great to bypass the getty login prompt and then run the script interactively 🤓!

Enough talk, lets dive in....

Bitbake allows for running code after succesfully building the root filesystem. The `ROOTFS_POSTPROCESS_COMMAND` allowed to edit the getty systemd service files using [sed](https://www.gnu.org/software/sed/manual/sed.html). Most importantly if you would open `console-getty.service` it runs `agetty` on the terminal in order to prompt for the user login. That not what I wanted, so I replaced it with `stty`.

`console-getty.service`

```ini
[Unit]
Description=Console Getty
After=systemd-user-sessions.service plymouth-quit-wait.service
Before=getty.target

[Service]
ExecStart=-/sbin/agetty --noclear --keep-baud console 115200,38400,9600 $TERM
Type=idle
Restart=always
RestartSec=0
UtmpIdentifier=cons
TTYPath=/dev/console
TTYReset=yes
TTYVHangup=yes
KillMode=process
IgnoreSIGPIPE=no
SendSIGHUP=yes

[Install]
WantedBy=getty.target
```



`interactive.bb`

```py
GETTY_SYSTEMD_SERVICES ?= " \
    ${IMAGE_ROOTFS}${systemd_system_unitdir}/serial-getty@.service \
    ${IMAGE_ROOTFS}${systemd_system_unitdir}/console-getty.service \
    ${IMAGE_ROOTFS}${systemd_system_unitdir}/getty@.service \
    ${IMAGE_ROOTFS}${systemd_system_unitdir}/container-getty@.service \
"
# Replace agetty, which prompts for a user login
# with stty. Than disable tty reset and hangup to
# continue the user input stream.
disable_login_prompt () {
    sed -i -e 's/^\(ExecStart *=\(.*\)$\)/ExecStart=-\/bin\/stty -F \/dev\/ttyPS0 115200 cs8 sane /' ${GETTY_SYSTEMD_SERVICES}
    sed -i -e 's/^\(TTYVHangup=yes$\)/TTYVHangup=no/' ${GETTY_SYSTEMD_SERVICES}
    sed -i -e 's/^\(TTYReset=yes$\)/TTYReset=no/' ${GETTY_SYSTEMD_SERVICES}
}

ROOTFS_POSTPROCESS_COMMAND += "disable_login_prompt;"
```



Next create a systemd service which runs after getty has started which to execute the interactive script.

`interactive.service`

```ini
[Unit]
Description=Interactive installation script that runs at startup.
After=getty.target multi-user.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/home/root/run-interactive-script
StandardInput=tty-force
StandardOutput=inherit
StandardError=inherit

[Install]
WantedBy=multi-user.target
```

Now you can boot your system without an user login promp but still access all features of your BSP running Linux.