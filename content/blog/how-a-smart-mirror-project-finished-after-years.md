+++
date = "2021-12-15"
publishDate = "2021-12-15"
title = "How a smart mirror project finished after years of work"
type = "post"
categories = ["Development"]
tags = ["Development", "DIY"]
+++

Early 2019 I got inspired by the [Magic Mirror](https://magicmirror.builders/) project. I thought it was so cool that I just had to build one for myself, from scratch. It was such a great oportunity to learn about new things, so I build the mirror and called it the Mirrorm8 project. I never wrote about it until now.

Like with many, our inspiration and creativity gives birth to a great amount of other ideas. But, as we slowly come back to earth we realize that with the little time we have there is only so little we can do. Display the weather forecast, upcoming agenda items, voice control, gesture control, facial recognition in order to dynammically switch content per user, realtime traffic- and crypto and stocks information ... The list is virtually endless. 

My first thoughts were to put the mirror in the bathroom, because that's where you see the device every day. In the moring it could give me all the information for that day. That way I know if I can take my bike to go to work or on a rainy day whether there would be allot of traffic. Me and my girlfriend both value our privacy and a few of my wild ideas required one way of imaging. Bathroom + camera don't really match well. So, a few ideas were taken off my list, but there was this one particullar item which I really wanted to have. I wanted to have some form of motion or proximity sensing, because I didn't want the display to be on the entire time. Putting a camera in was of the table and using an infrared (IR) sensor wouldn't work, since the sensor would be placed behind the glass and most IR waves would be blocked by the glass. This would leave me with Bluetooth (BLE) proximity, an other form of light like lasers or some form of capturing sound.

The mirrors' frame is build out of wood and the monitor would be leveled with the wooden frame. This allowed the glass to cover the entire front, to act as a mirror. I decided to go for a spy mirror film instead of acrilic class since it was much cheaper. The spy film partially reflects light while the light emitted by the monitor would still be visible. A Raspberry Pi is mounted at the back of the frame and Mirrorm8 is deployed on it. I used [DietPi](https://dietpi.com/) as an Linux image, which allowed me to easily install dependencies, do backups and receive updates.

While shopping at a hardware store I found these thin metal brackets, interlocking connectors, that allow the whole thing to be blindly mounted on the wall. Normally, such brackets are used hang mirrors on the wall. Then I bought an old second hand 28" TFT monitor that I completely stripped of its housing. After preparing drawings and double-checking the measurments I got help from a friendly neighbour, who's a very skilled woodworker, with sawing the wooden fram. I cleaned the wood and used [Polyvine verniswas](https://www.polyvine.be/) to give it those dark looks.

To reduce the project scope I decided to include only the following features: 

* Display date and time
* Display the weather forecast
* Display upcoming Google Calandar items
* Dynamically turn on and off the monitor.

While researching to solve the proximity sensor problem I found the [RCWL-0516](https://github.com/jdesbonnet/RCWL-0516). A doppler radar microwave motion sensor capable of detecting proximity while being compatible with the Raspberry Pi. 23 April 2019 I started and developing the frontend using TypeScript and [Nuxt.js](https://nuxtjs.org/), a based Vue.js frontend framework.

At the time Nuxt.js just recently introduced support for TypeScript, but there was a lack of documentation, examples and changing APIs. It was a recipe for disaster, but that wouldn't stop my enthousiasm. After spending countless days and nights trying integrate Socket.io. Nuxt.js spins up its own server using `expressjs`, but I wanted to use or extend my own middleware. Therefore, I needed to overwrite or extend the express server, but I never figured out what was wrong at the time. Because of this I decided to put the project on ice for a little while until Nuxt.js TypeScript support was more stable. In August 2020 in my summer holiday and with the release of `"@nuxt/typescript-runtime": "1.0.0"`, I succesfully build the software project with the desired `serverMiddleware` [b019c94](https://github.com/ovaar/mirrorm8/commit/b019c94de2d44afebc33e372c523a3f1f6592fdd). Finally, I finished with automatically updating the weather forecast, upcoming Google Calander items, date time and turning on/off the display dynamically using the RCWL-0516 proximity sensor.

After being done with most the development I started testing. Because mirrorm8 uses native dependencies it needs to be build on the target, which was inconvenient because of the long build time. DietPi automatically starts the mirrorm8 service and boots Chromium with the server url in kiosk mode. Unfortunately, I found out that Google OAuth2 is not supported by Google in the open-source [Chromium](https://www.chromium.org/) browser. The fix was to replace Google OAuth2 with [Google API key](https://docs.simplecalendar.io/google-api-key/) instead.

{{< img src="/img/IMG_20190609_171025.jpg" alt="Mirrorm8 - Wooden Frame Pieces" >}}
{{< img src="/img/IMG_20190610_113928.jpg" alt="Mirrorm8 - Wooden Frame Assembled Front" >}}
{{< img src="/img/IMG_20200423_225011.jpg" alt="Mirrorm8 - Wooden Frame Assembled Back" >}}
{{< img src="/img/IMG-20200423-WA0021.jpg" alt="Mirrorm8 - Spy film Glas" >}}
{{< img src="/img/IMG_20200720_190254.jpg" alt="Mirrorm8 - Chromium restore pages" >}}

Up until today the mirror has been mounted up against the wall in the hallway.


Bill of material:

| Items                     |    Cost |
| ------------------------- | ------: |
| 28" TFT monitor           |  €70,00 |
| Glass                     |  €20,00 |
| Glass Film                |  €12,00 |
| Wood                      |  €15,00 |
| Raspberry pi 3            |  €40,00 |
| RCWL-0516                 |   €3,31 |
| Breadboard                |   €4,50 |
| Glass clips               |   €2,00 |
| Sandisk Ultra Fit 4GB     |  €23,80 |
| 'Blind' mirror wall mount |  €12,00 |
| Total                     | €202,61 |

The project is open source and is hosted on [Github](https://github.com/ovaar/mirrorm8).

Lessons learned:

- I learned that choosing new technology is riskfull.
- I learned about Nuxt.js with TypeScript.
- I learned about Vuex-class, which is great for seperation of concerns.
- I leanred that Google OAuth2 is not allowed on the open-source Chromium browser.
- I learned that applying mirror foil is hard, because it leaves wrinkles. I recommend acrillic glass.
- I learned how to oil wood.