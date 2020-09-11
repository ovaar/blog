+++
date = "2020-07-27"
title = "[Linux] Setting MAC address"
type = "post"
categories = ["Development", "Linux"]
tags = ["Development", "Linux", "shell"]
+++

## [Linux] Setting MAC address

[Last post](/blog/yocto-interactive-shell/) I wrote about a embedded device running Linux where a MAC address is stored in the EEPROM. The first six bytes are reserved for the MAC address which (ideally) only should be written once.

To apply the MAC address the numbers need to be hexadecimal formatted and separated with a colon(`:`) symbol. It is possible to dynamically change the MAC address of Ethernet, beware that you need to be `root` and that the ethernet interface is not up.

```shell
ifconfig eth0 hw ether 00:01:02:03:04:05
```

Or, you could permanently change the MAC address by setting it into the `hwaddress` in the `/etc/network/interfaces` configuration file.

```shell
auto eth0
iface eth0 inet dhcp
    hwaddress ether 00:01:02:03:04:05
```

Now we know how and where to set the MAC address. Next, we can read the first six bytes using `dd` and pipe it to `hexdump`. Fortunately, [hexdump](https://www.man7.org/linux/man-pages/man1/hexdump.1.html) already provides API for formatting the input.

The `-e '1/1' %02x` parameter will format each space followed by a byte into a hexadecimal number with two digits and a leading zero if needed.

```bash
DELIMITER=":"
MAC=$(dd if=$EEPROM bs=6 count=1 | hexdump -ve '1/1 "%02x'"$DELIMITER"'"')
echo $MAC # output 00:01:02:03:04:05:
```

Finnaly the trailing colon `:` needs to be removed. There are multiple ways to do this

1. Pipe the output to `sed` and replace the last `:` OR
2. Use Bash Substring Expansion to remove the character from a string.

Solution 1:

```shell
MAC=$(dd if=$EEPROM bs=6 count=1 | hexdump -ve '1/1 "%02x'"$DELIMITER"'"' | sed s/:$//g)
```

Solution 2:

```shell
MAC=$(dd if=$EEPROM bs=6 count=1 | hexdump -ve '1/1 "%02x'"$DELIMITER"'"')
MAC=${MAC::-1} # Remove last character ':'
```

Personally I prefer solution 2 since I find that `sed` harder to read and I often have to explain it to other engineers who are reviewing it. Therefore solution 2 (with a comment) is clearer. If you are a system expert and love one-lines, go for solution 1.
