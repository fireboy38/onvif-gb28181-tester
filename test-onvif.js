const onvif = require('node-onvif');

async function testDevice() {
  console.log('Testing ONVIF device...');
  
  // 测试发现
  console.log('Starting discovery...');
  onvif.startProbe().then((device_info_list) => {
    console.log('Found ' + device_info_list.length + ' devices.');
    device_info_list.forEach((info) => {
      console.log('  - ' + info.urn);
      console.log('    ' + info.xaddrs[0]);
    });
  }).catch((error) => {
    console.error('Discovery error:', error.message);
  });
  
  // 等待发现完成
  await new Promise(resolve => setTimeout(resolve, 6000));
  
  console.log('\nTrying to connect without auth...');
  const device = new onvif.OnvifDevice({
    xaddr: 'http://192.168.0.247/onvif/device_service'
  });

  try {
    console.log('Initializing device...');
    await device.init();
    console.log('Device initialized successfully!');
    
    const info = device.getInformation();
    console.log('Device Info:', info);
    
  } catch (err) {
    console.error('No auth error:', err.message);
  }
  
  console.log('\nTrying to connect with auth...');
  const device2 = new onvif.OnvifDevice({
    xaddr: 'http://192.168.0.247/onvif/device_service',
    user: 'admin',
    pass: 'lzzx@0813'
  });

  try {
    console.log('Initializing device...');
    await device2.init();
    console.log('Device initialized successfully!');
    
    const info = device2.getInformation();
    console.log('Device Info:', info);
    
    const profiles = device2.getProfiles();
    console.log('Profiles:', profiles);
    
  } catch (err) {
    console.error('With auth error:', err.message);
  }
}

testDevice();
