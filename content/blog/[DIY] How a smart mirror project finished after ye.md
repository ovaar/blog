[DIY] How a smart mirror project finished after years of work

This post is about how I finished a slightly "overtime" DIY hobby project.

Somewhere early 2019 I got inspired by the [Magic Mirror](https://magicmirror.builders/) project. Having a smart mirror in your house is somewhat a unique object. You can put it up for display is your living room or in the bathroom so that you see it every day. I had tons of ideas! From controlling the mirror using hand motion sensors with [Leap Motion Controller](https://www.ultraleap.com/product/leap-motion-controller/), displaying commuter traffic, weather forecast, upcoming agenda items, facial recognition in order to dynammically switch between users agenda, dynamically turn on and off the monitor display to reduce power usage, voice controll or integration with Google Assistant. To not let the scope creep get to me I decided to stick with: Datetime, weather forecast, Google agenda items and proximity sensing.

For me it seemed a great project to build myself. While I like to build software, I also like to craft with my hands. For me, having something handmade is what I value allot. Your first build might not be great, but the more you build the better you will become. Think about it, who'd make a better vase? Someone who did a master in pottery or someone who during the same period time made over a 1000 vases?

After some research on technology and making some build plans I made my first commit on 23 April, 2019. I decided to use [Nuxt.js](https://nuxtjs.org/), a Vue.js based, frontend framework in combination with TypeScript. The application would be Service Side Rendered (SSR) and needed to be deployed on a Raspberry Pi, running chromium in kiosk mode. The mirror itself would be build out of a wooden frame where a TFT monitor would be embedded in. In front of the monitor a glass window would be mounted that is covered with a mirror spy film for the "mirror" effect.

Me and my girlfriend both value our privacy, so I decided that putting a camera inside the smart mirror was not such a good idea, since at first I wanted to put it in the bathroom. For motion sensing I had to come up with other ideas. First, I thought about using an infrared camera to detect if a person would be standing in front of the mirror. But, since the infrared camera would needed to be embedded into the wooden frame behind the glass mirror it could not work. Most IR waves would not be able to go through glass, instead they would bounce off.

Another idea was to use Bluetooth (BLE) proximity. Using the BLE signature I would be able to tell what user would be in close to the mirror. Though Bluetooth is not fool-proof because I personally tend to turn my smartphone's Bluetooth off from time to time. Eventually, after searching and reading countless website and blogs I found and immediately ordered the [RCWL-0516](https://github.com/jdesbonnet/RCWL-0516), a doppler radar microwave motion sensor. The 5v power supply, ground and OUT pin are wired to the Raspberry Pi and the GPIO pin it readout in order to get a signal inside the Node.js application. I can say that it works really well for detection motion when entering the room.

During the hardware feasibility I already started coding. At the time I have been using Node.js intensively and I was really enthousiastic learning and using TypeScript so, I decided build the whole stack using TypeScript. I suppose I was one of the first developers who would have started to build software with TypeScript and Nuxt. Note the first nuxt-typescript entry in the package.json `"@nuxt/typescript-runtime": "0.3.3",`. I believe that this is what caused me most headaches. I wanted to start an `express` server instead of using the `Routes` api Nuxt provided because I wanted to use `socket.io` to get motion sensor notifications in the Vue frontend. This was hardly documented and changed several times due to its matureness. After trying many possible solutions, digging through sources and countless nights I gave up. I put the smart mirror project aside, because I could find no pleasure in this side project. In the beginning of Augustus 2020 in my summer holiday I gave it another try. In the meanwhile Nuxt has been evolving and with the release of `"@nuxt/typescript-runtime": "1.0.0"`, I was able to achieve compiling the mirrorm8 project with the desired `serverMiddleware` [b019c94](https://github.com/ovaar/mirrorm8/commit/b019c94de2d44afebc33e372c523a3f1f6592fdd).

Up until today the mirror has been mounted up against the wall in the hallway. 




Bill of material:

| Items           | Cost    |
|-----------------|--------:|
| 28" TFT monitor | €70,00  |
| Glass      	  | €20,00  |
| Glass Film      | €12,00  |
| Wood 			  | €15,00  |
| Raspberry pi 3  | €40,00  |
| RCWL-0516  	  | €3,31   |
| Breadboard	  | €4,50   |
| Glass clips	  | €2,00   |
| Sandisk Ultra Fit 4GB | €23,80  |
| 'Blind' mirror wall mount | €12,00 |


				 


The project is open source and is hosted on [Github](https://github.com/ovaar/mirrorm8).


Lessons learned:
* Choose acrillic glass over mirror foil, because the foil wrinkles and its hard to remote the remaining air bubbles.
* I learned how to oil wood
* I learned about Nuxt.js with TypeScript.
* I learned about socket.io namespaces
* I learned to deal incorrect and conflicting documentation of Nuxt.