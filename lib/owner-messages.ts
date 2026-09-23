import type {Locale} from './locale';
// Source copy is the stable key. Only authored UI copy is passed to this catalog.
// Customer names, messages, vehicle details and published legal documents are not translated.
const rows = `
أنت بدون اتصال. تحتاج الإنترنت لإرسال البلاغات وحفظ التغييرات.|You are offline. Connect to send reports and save changes.
تثبيت دورني|Install Dorni
نسخة جديدة من دورني جاهزة. احفظ تغييراتك ثم حدّث.|A new version of Dorni is ready. Save your changes before updating.
تحديث الآن|Update now||حدّث توا
تعذر فتح نافذة التثبيت. استخدم قائمة المتصفح لإضافة دورني للشاشة الرئيسية.|Could not open the install prompt. Add Dorni to your home screen from the browser menu.
دورني معاك|Dorni with you|دورني معك
دورني مثبت على جهازك|Dorni is installed
دورني على شاشة تلفونك|Dorni on your home screen|دورني على شاشة هاتفك
افتح حسابك وسياراتك وتنبيهاتك من أيقونة دورني، بنفس بيانات الدخول.|Open your account, vehicles and alerts from the Dorni icon with the same sign-in details.
تفتح التطبيق الآن في وضع مستقل.|You are using the installed app.
جاري التثبيت...|Installing…|جارٍ التثبيت…
لو خيار التثبيت مش ظاهر، اتبع خطوات جهازك تحت. وقد يكون دورني مثبتاً بالفعل.|If installation is unavailable, follow the steps for your device below. Dorni may already be installed.|إذا لم يظهر خيار التثبيت، اتبع خطوات جهازك أدناه. قد يكون دورني مثبتاً بالفعل.
آيفون|iPhone
أندرويد|Android
افتح دورني في Safari.|Open Dorni in Safari.
من قائمة المشاركة اختار «إضافة إلى الشاشة الرئيسية».|Choose “Add to Home Screen” from the Share menu.|اختر «إضافة إلى الشاشة الرئيسية» من قائمة المشاركة.
أكد الإضافة وافتح دورني من الأيقونة الجديدة.|Confirm and open Dorni from its new icon.
افتح دورني في Chrome.|Open Dorni in Chrome.
اضغط زر التثبيت، أو افتح قائمة المتصفح واختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».|Tap Install, or open the browser menu and choose “Install app” or “Add to Home Screen”.|اضغط زر التثبيت أو اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» من قائمة المتصفح.
افتح دورني من الشاشة الرئيسية وسجّل دخولك.|Open Dorni from your home screen and sign in.
التنبيهات حالياً|Notifications|التنبيهات
بعد التثبيت سجّل دخولك وافتح الإعدادات لتفعيل إشعارات هذا الجهاز وإرسال اختبار. التثبيت وحده لا يمنح إذن الإشعارات.|After installing, sign in and enable device notifications in settings. Send a test. Installing alone does not grant notification permission.
فتح حسابي|Open my account
تسجيل الدخول أو إنشاء حساب|Sign in or create an account
تبديل الوضع الفاتح والداكن|Toggle light and dark mode
تبديل المظهر|Change appearance
داكن|Dark
فاتح|Light
تعذر ربط دعوة الشركة. افتح رابط الدعوة من جديد.|Could not link the company invitation. Open the invitation link again.
تم تأكيد البريد، لكن تعذر تجهيز الحساب الدائم. سجّل الدخول مرة أخرى لإعادة التجهيز تلقائياً.|Email confirmed, but account setup failed. Sign in again to retry.
رابط البريد غير صالح أو انتهت صلاحيته.|The email link is invalid or expired.
لو البريد مسجل، بيصلك رابط لتغيير كلمة المرور.|If the email is registered, you will receive a password reset link.|إذا كان البريد مسجلاً، فسيصلك رابط لتغيير كلمة المرور.
تم حفظ تسجيل الشركة. افتح رسالة التأكيد، وبعدها تتكوّن بوابة الشركة تلقائياً.|Company registration saved. Confirm your email to set up the company portal.|حُفظ تسجيل الشركة. افتح رسالة التأكيد لإكمال إعداد بوابة الشركة.
تم إنشاء الحساب. افتح رسالة التأكيد في بريدك وبعدها ادخل.|Account created. Confirm your email, then sign in.|أُنشئ الحساب. افتح رسالة التأكيد ثم سجّل الدخول.
تعذر إكمال العملية|Could not complete the action
تسجيل الدخول إلى دورني|Sign in to Dorni
صاحب سيارة|Vehicle owner
شركة / شريك|Company / partner
بوابة الشركات|Company portal
فعّل حساب الشركة|Activate company account
سجّل شركتك|Register your company
أنشئ حسابك|Create your account
استرجع كلمة المرور|Reset password
تسجيل الدخول|Sign in
أنشئ حسابك للانضمام إلى الشركة.|Create your account to join the company.
أنشئ ملف الشركة، وبعد تأكيد البريد تقدر تولّد أكواد وQR محفوظة في المنظومة.|Create your company profile and confirm your email to issue and manage QR codes.|أنشئ ملف الشركة وأكّد البريد لإصدار الأكواد وإدارتها.
ادخل ببريد الشركة وكلمة المرور أو سجّل شركة جديدة.|Sign in with your company email and password, or register a company.
سياراتك وبطاقاتك وتنبيهاتك في مكان واحد.|Your vehicles, cards and alerts in one place.
دعوة شركة موثقة|Company invitation
الاسم الكامل|Full name
اسم الشركة|Company name
نوع النشاط|Business type
شركة|Company
تأمين|Insurance
موزع|Distributor
رقم السجل التجاري (اختياري)|Registration number (optional)
البريد الإلكتروني|Email
كلمة المرور|Password
إخفاء كلمة المرور|Hide password
إظهار كلمة المرور|Show password
8 أحرف على الأقل، فيها حرف إنجليزي ورقم|At least 8 characters, including a Latin letter and a number|8 أحرف على الأقل تتضمن حرفاً إنجليزياً ورقماً
جاري التنفيذ...|Working…|جارٍ التنفيذ…
إنشاء حساب الشركة|Create company account
إنشاء الحساب|Create account
إرسال رابط الاسترجاع|Send reset link
دخول|Sign in
شركة جديدة؟ أنشئ حساب الشركة|New company? Create an account
ما عندكش حساب؟ أنشئ حساب|No account? Sign up|ليس لديك حساب؟ أنشئ حساباً
عندك حساب شركة؟ سجل دخول|Have a company account? Sign in|لديك حساب شركة؟ سجّل الدخول
عندك حساب؟ سجل دخول|Have an account? Sign in|لديك حساب؟ سجّل الدخول
نسيت كلمة المرور|Forgot password
رجوع لتسجيل الدخول|Back to sign in
بيانات الدخول لا تظهر للشركات ولا لأي شخص يمسح بطاقة دورني.|Your sign-in details are not shown to companies or people scanning your card.
جاري تحميل الدخول...|Loading sign in…|جارٍ تحميل صفحة الدخول…
اتصال آمن|Secure connection
استرجاع الحساب|Account recovery
اختر كلمة مرور جديدة|Choose a new password
لازم تكون 8 أحرف على الأقل، فيها حرف إنجليزي ورقم.|Use at least 8 characters, including a Latin letter and a number.|استخدم 8 أحرف على الأقل تتضمن حرفاً إنجليزياً ورقماً.
كلمة المرور الجديدة|New password
جاري الحفظ...|Saving…|جارٍ الحفظ…
حفظ ودخول|Save and sign in
هناك ضرر أو مشكلة بالسيارة|Vehicle damage or issue||في ضرر أو مشكلة في السيارة
الموقع غير مدعوم في هذا الجهاز|Location is not supported on this device
ما قدرناش ناخذ الموقع، تقدر ترسل البلاغ بدونه|Could not get your location. You can send the report without it.|تعذر تحديد موقعك. يمكنك إرسال البلاغ بدونه.
تم إرسال البلاغ لكن تعذر فتح المتابعة.|Report sent, but the tracking page could not be opened.
تواصل آمن|Private communication
جاري التحقق من الكود...|Checking card…|جارٍ التحقق من الكود…
تعذر عرض البطاقة|Could not display card
تأكيد السيارة|Confirm vehicle
بطاقة مفعّلة|Active card
شن تبي تقول لصاحب السيارة؟|What would you like to tell the owner?|ماذا تريد إبلاغ صاحب السيارة؟
اختار سبب واضح؛ ما فيش رسائل حرة أو كشف بيانات.|Choose a reason. No free-text messages or contact details are shared.|اختر سبباً واضحاً؛ لا توجد رسائل حرة أو مشاركة لبيانات الاتصال.
سبب التنبيه|Alert reason
تمت إضافة الموقع اختيارياً|Optional location added
إضافة موقعي اختيارياً|Add my location (optional)
جاري إرسال التنبيه...|Sending alert…|جارٍ إرسال التنبيه…
إرسال التنبيه|Send alert
لا يظهر اسم أو رقم صاحب السيارة، وإضافة الموقع اختيارية.|The owner's name and phone are hidden. Sharing your location is optional.
صاحب السيارة جاي|The owner is on their way|صاحب السيارة في الطريق
صاحب السيارة مش قادر يوصل توا|The owner cannot get there now|لا يستطيع صاحب السيارة الوصول الآن
تعذر تحميل حالة البلاغ|Could not load report status
تعذر تحديث حالة البلاغ؛ سنعيد المحاولة.|Could not refresh report status. We will retry.
رابط الحالة غير متاح|Status link unavailable
جاري تحميل حالة البلاغ|Loading report status|جارٍ تحميل حالة البلاغ
بلاغ محفوظ|Report saved
رد صاحب السيارة|Owner response
في انتظار رد صاحب السيارة|Waiting for the owner to reply||نستنّوا رد صاحب السيارة
هذه الحالة تُحدّث تلقائياً من رد صاحب السيارة المحفوظ في دورني.|This status updates automatically when the owner replies.
تم استلام البلاغ|Report received
مسجّل في النظام|Saved in Dorni
في انتظار الرد|Awaiting reply||نستنّوا الرد
الرابط خاص بهذا البلاغ وينتهي تلقائياً.|This link is specific to this report and expires automatically.
تم حفظ الطلب وإرساله لعمليات دورني.|Request saved and sent to Dorni operations.
جاري تحميل بوابة الشركة|Loading company portal|جارٍ تحميل بوابة الشركة
بوابة الشركة|Company portal
تعذر فتح بوابة الشركة|Could not open company portal
صلاحيتك:|Your role:
— بيانات الشركة محفوظة في حسابك|— company details saved to your account
أكواد صادرة|Issued codes
أكواد مفعّلة|Activated codes
طلبات معلقة|Pending requests
أعضاء الشركة|Team members
إصدار دفعة أكواد وQR|Issue a QR code batch
طلب دفعة جديدة|Request a new batch
يراجع فريق دورني الطلب ثم يصدر الدفعة مركزياً.|Dorni reviews the request before issuing the batch.
عدد الأكواد المطلوبة|Number of codes
ملاحظات اختيارية|Notes (optional)
إنشاء الأكواد وQR|Generate codes and QR
إرسال الطلب|Send request
ملفات الإنتاج الآمنة|Secure production files
تحتوي الرقم التسلسلي ورمز التفعيل ورابط QR، ولا تظهر للعامة.|Includes serial numbers, activation codes and QR links. Not publicly accessible.
تم تنزيله سابقاً|Previously downloaded
جاهز للتنزيل|Ready to download
تنزيل CSV|Download CSV
لا يوجد ملف إنتاج بعد.|No production file yet.
الأكواد وحالة التفعيل|Codes and activation status
الرقم التسلسلي|Serial number
الدفعة|Batch
QR والمسح|QR and scan
مفعّل|Activated
غير مفعّل|Not activated
عرض QR|View QR
نسخ|Copy
ما فيش أكواد صادرة توا.|No codes issued yet.|لا توجد أكواد صادرة حالياً.
رمز QR للبطاقة|Card QR code
عند المسح يفتح رابط البلاغ الخاص بهذا الكود. بعد ما الزبون يفعّله تتغير حالته هنا إلى مفعّل.|Scanning opens the report link for this code. Its status changes to activated after the customer activates it.|يفتح المسح رابط البلاغ الخاص بالكود. تتغير الحالة إلى مفعّل بعد تفعيل العميل له.
تجربة رابط المسح|Open scan link
رجوع للحساب|Back to account
أدخل عدداً صحيحاً من 1 إلى {limit}|Enter a whole number from 1 to {limit}
تم إصدار {count} أكواد في الدفعة {batch}. يمكنك عرضها وتنزيل ملف الدفعة.|Issued {count} codes in batch {batch}. View the codes or download the batch file.
الأكواد تُنشأ وتُحفظ فوراً. حد الحساب {limit} كود يومياً.|Codes are issued and saved immediately. Account limit: {limit} codes per day.
انقل البطاقة لسيارة أخرى أو ألغها قبل الأرشفة.|Move or retire the card before archiving the vehicle.
العنصر غير موجود أو غير تابع لحسابك.|Item not found or not owned by your account.
التذكرة مغلقة. افتح تذكرة جديدة للمتابعة.|This ticket is closed. Open a new ticket to continue.
وصلت للحد اليومي لتذاكر الدعم.|You have reached the daily support ticket limit.
حالة العنصر لا تسمح بهذه العملية.|This action is not allowed in the item's current state.
أكد العملية أولاً.|Confirm the action first.
راجع البيانات المدخلة.|Check the details you entered.
الحساب غير نشط.|Account is inactive.
تعذر تحميل البيانات أو غير مصرح لك بالوصول.|Could not load data, or access is not permitted.
تعذر تحميل البيانات|Could not load data
طلب غير صالح|Invalid request
معرف غير صالح|Invalid identifier
عنوان الطلب غير مسموح|Request origin is not allowed
الطلب أكبر من المسموح|Request is too large
تعذر تنفيذ العملية. راجع البيانات والصلاحيات.|Could not complete the action. Check the details and your permissions.
بيانات الطلب غير صالحة|Invalid request details
غير مصرح لك بإنشاء الدفعات|You are not allowed to create batches
تعذر إنشاء الدفعة|Could not create batch
بيانات الدفعة غير صالحة|Invalid batch details
تم إنشاء الإدارة مسبقاً|Administration is already configured
تعذر تهيئة الإدارة|Could not configure administration
التصدير منتهي أو غير موجود|Export expired or not found
تعذر تجهيز التصدير|Could not prepare export
تعذر تحميل لوحة العمليات|Could not load operations
اكتب اسم الشركة وبريد المدير بشكل صحيح|Enter a valid company name and administrator email
تعذر إنشاء الشريك|Could not create partner
تعذر تسجيل الخروج|Could not sign out
اكتب بريداً إلكترونياً صحيحاً|Enter a valid email address
تعذر إرسال رابط الدخول. حاول مرة ثانية بعد قليل.|Could not send sign-in link. Try again shortly.
تم إيقاف تسجيل الهاتف. استخدم البريد الإلكتروني وكلمة المرور.|Phone sign-in is disabled. Use your email and password.
اسم الشركة مطلوب|Company name is required
تعذر تحديد نوع الحساب|Could not determine account type
البريد أو كلمة المرور غير صحيحة|Incorrect email or password
هذا الحساب غير مربوط بشركة في دورني|This account is not linked to a company in Dorni
دعوة الشركة غير صالحة أو انتهت|Company invitation invalid or expired
استخدم نفس البريد المكتوب في دعوة الشركة|Use the email address on the company invitation
البريد مسجل من قبل|Email is already registered
تعذر إنشاء الحساب|Could not create account
تم إنشاء الحساب لكن تعذر تجهيز ملفه الدائم|Account created, but profile setup failed
تم إنشاء الحساب لكن تعذر ربط دعوة الشركة|Account created, but the company invitation could not be linked
راجع البيانات: البريد صحيح وكلمة المرور 8 أحرف وفيها رقم|Check your email and use a password of at least 8 characters with a number
تعذر إكمال العملية توا|Could not complete the action now|تعذر إكمال العملية الآن
بيانات المطالبة غير صحيحة|Incorrect activation details
تعذر تفعيل البطاقة|Could not activate card
بيانات المطالبة غير صالحة|Invalid activation details
تعذر تحديث التنبيهات|Could not refresh alerts
تعذر تحميل الحساب|Could not load account
غير مسموح|Not allowed
أكد تسجيل الخروج من الأجهزة الأخرى|Confirm signing out of other devices
تعذر إنهاء الجلسات الأخرى|Could not sign out other sessions
صلاحيتك للعرض فقط|Your access is read-only
تعذر إرسال طلب الدفعة|Could not send batch request
ما عندكش عضوية شريك فعّالة|You do not have an active partner membership|ليست لديك عضوية شريك فعّالة
تعذر تحميل بوابة الشريك|Could not load partner portal
الشركة غير مخولة بالتوليد المباشر|Company is not authorised for direct code generation
وصلت للحد اليومي المسموح لحساب الشركة|Company daily limit reached
غير مصرح بالتوليد|Code generation is not allowed
الكمية لازم تكون بين 1 و1000|Quantity must be between 1 and 1000|يجب أن تكون الكمية بين 1 و1000
الكود غير موجود أو مش تابع لشركتك|Code not found or not owned by your company|الكود غير موجود أو غير تابع لشركتك
ملف الدفعة منتهي أو غير موجود|Batch file expired or not found
تعذر إنشاء QR|Could not create QR code
تعذر تجهيز ملف الدفعة|Could not prepare batch file
الكود غير صالح أو غير مفعّل|Invalid or inactive code
محاولات كثيرة، حاول بعد دقيقة|Too many attempts. Try again in a minute.
تعذر إرسال البلاغ|Could not send report
بيانات البلاغ غير صالحة|Invalid report details
رابط الحالة منتهي أو غير صالح|Status link expired or invalid
تعذر تحميل إعدادات الإشعارات|Could not load notification settings
تعذر التحقق من عنوان التطبيق. افتح دورني من رابطه الرسمي وحاول مرة أخرى.|Could not verify the app address. Open Dorni from its official link and try again.
اشتراك الجهاز غير مكتمل|Device subscription is incomplete
انتظر دقيقة قبل إرسال تجربة أخرى.|Wait a minute before sending another test.
وصلت للحد الأقصى للأجهزة. عطّل إشعارات جهاز قديم أولاً.|Device limit reached. Disable notifications on an old device first.
تعذر حفظ إعدادات الإشعارات. حاول مرة أخرى.|Could not save notification settings. Try again.
بيانات اشتراك الجهاز غير صالحة|Invalid device subscription
رد غير صالح|Invalid response
تعذر تحديث البلاغ|Could not update report
تعذر تحميل التذاكر|Could not load support tickets
تعذر حفظ التذكرة. تحقق من البيانات والعناصر المرتبطة.|Could not save ticket. Check its details and linked items.
تعذر فتح التذكرة|Could not open ticket
بيانات السيارة غير صالحة|Invalid vehicle details
تعذر إضافة السيارة|Could not add vehicle
السيارة تعيق خروجي|The vehicle is blocking my exit||السيارة سادّة عليّ
الرجاء تحريك السيارة|Please move the vehicle||بالله حرّك السيارة
الأنوار ما زالت شغّالة|The lights are still on|الأنوار لا تزال مضاءة
باب أو نافذة مفتوحة|A door or window is open||باب أو شباك مفتوح
هناك ضرر بالسيارة|The vehicle appears damaged||في ضرر في السيارة
تنبيه عاجل|Urgent alert
تعذر تحديث التنبيهات تلقائياً|Could not refresh alerts automatically
تعذر تحديث التنبيهات تلقائياً؛ سنعيد المحاولة.|Could not refresh alerts. We will try again.
تم نسخ رابط البطاقة|Card link copied
تمت إضافة السيارة|Vehicle added
تم تفعيل بطاقة دورني وربطها بالسيارة|Dorni card activated and linked to your vehicle
تعذر تحميل حسابك|Could not load your account
إعادة المحاولة|Try again||جرّب مرة ثانية
رجوع للدخول|Back to sign in
جاري تحميل حسابك...|Loading your account…|جارٍ تحميل حسابك…|نحمّلوا حسابك…
فتح القائمة|Open menu
إغلاق|Close
حساب دورني|Dorni account
حساب فعّال|Active account
سيارات|vehicles
الدعم الفني|Support
كيفية استخدام دورني|How to use Dorni
الشروط والخصوصية|Terms and privacy
الإعدادات|Settings
تسجيل الخروج|Sign out
حساب صاحب السيارة|Vehicle owner
سياراتي وبطاقاتي|My vehicles and cards
التنبيهات الواردة|Incoming alerts
أهلاً بيك في دورني|Welcome to Dorni|مرحباً بك في دورني
وصلك بلاغ جديد على سيارتك|You have a new vehicle alert|ورد بلاغ جديد عن سيارتك
عرض التنبيهات|View alerts||شوف التنبيهات
إغلاق التنبيه|Dismiss alert
رجوع للرئيسية|Back to home
إضافة سيارة|Add vehicle
بيانات بسيطة، بدون رقم اللوحة|Basic details, no plate number needed
الشركة المصنّعة|Manufacturer
الشركة|Manufacturer
الموديل|Model
لون السيارة|Vehicle colour
اللون|Colour
سنة السيارة (اختياري)|Vehicle year (optional)
السنة (اختياري)|Year (optional)
حفظ السيارة|Save vehicle
تفعيل بطاقة دورني|Activate Dorni card
اربط بطاقتك الأصلية بسيارتك|Link your Dorni card to your vehicle
رمز المطالبة السري|Secret activation code
السيارة المراد ربطها بالبطاقة|Vehicle to link to the card
اختر السيارة|Choose vehicle
تفعيل وربط البطاقة|Activate and link card
سياراتك|Your vehicles
إدارة السيارات والبطاقات|Manage vehicles and cards
ابدأ بإضافة سيارتك من القسم فوق.|Add your vehicle using the section above.|ابدأ بإضافة سيارتك من القسم أعلاه.
بطاقة فعّالة|Active card
بطاقة موقوفة|Paused card
بانتظار بطاقة|No card linked
فتح صفحة البطاقة|Open card page
نسخ الرابط|Copy link
فعّل بطاقة من قسم التفعيل فوق.|Activate a card using the section above.|فعّل بطاقة من قسم التفعيل أعلاه.
تعديل وإدارة السيارة|Edit and manage vehicle
بطاقاتك وQR|Your cards and QR codes
رمز QR الخاص بالسيارة|Vehicle QR code
فتح صفحة المسح|Open scan page
أضف سيارة ثم فعّل بطاقة دورني أصلية.|Add a vehicle, then activate a Dorni card.
ما فيش تنبيهات توا|No alerts yet|لا توجد تنبيهات حالياً
أي بلاغ من بطاقة فعّالة بيظهر هنا مع سجل حالته.|Alerts from active cards appear here with their status history.|تظهر هنا البلاغات من البطاقات الفعّالة مع سجل حالتها.
يحتاج رد|Needs a reply||يستنى ردّك
تم الحل|Resolved
تم الرد|Replied
مغلق|Closed
انتهى البلاغ|Expired alert
جاي للسيارة|On my way|أنا في الطريق إلى السيارة
تم حل الموضوع|Issue resolved
مش قادر نوصل توا|Cannot get there now|لا أستطيع الوصول الآن
التنقل الرئيسي|Main navigation
الرئيسية|Home
سياراتي|My vehicles
التنبيهات|Alerts
تنبيهات سيارتك|Your vehicle alerts
ما عندكش تنبيهات معلّقة|No pending alerts|لا توجد تنبيهات معلّقة
راجع البلاغات الواردة وردّ على صاحب البلاغ.|Review incoming alerts and reply to the sender.||شوف البلاغات وردّ على اللي بعثلك.
أي بلاغ جديد على بطاقتك يظهر هنا.|New alerts for your card appear here.||أي بلاغ جديد على بطاقتك يطلع هنا.
أحدث التنبيهات|Latest alerts
تنبيه على السيارة|Vehicle alert
سيارتك|Your vehicle
عرض الكل|View all||شوف الكل
ابدأ بسيارتك|Start with your vehicle
أضف بيانات السيارة، وبعدها اربط بطاقة دورني لاستقبال البلاغات عليها.|Add your vehicle, then link a Dorni card to receive alerts.|أضف بيانات السيارة، ثم اربط بطاقة دورني لاستقبال البلاغات.|ضيف سيارتك، وبعدها اربط بطاقة دورني باش توصلك البلاغات.
البطاقة فعّالة|Card active
البطاقة غير فعّالة|Card inactive
تحتاج تفعيل بطاقة|Activate a card|تحتاج إلى تفعيل بطاقة|فعّل بطاقتك
الحساب|Account
وسائل التواصل|Contact details
السيارات|Vehicles
بطاقة QR / NFC|QR / NFC card
تفعيل البطاقة|Card activation
الإشعارات|Notifications
مشكلة تقنية|Technical issue
المدفوعات|Payments
أخرى|Other
مفتوحة|Open
قيد المتابعة|In progress
بانتظار ردك|Awaiting your reply||نستنّوا ردّك
مغلقة|Closed
السيارات والبطاقات|Vehicles and cards
الأمان والجلسات|Security and sessions
اللغة|Language
طلب حذف الحساب|Account deletion request
تم إنهاء الجلسات الأخرى. قد يستغرق اكتمال تسجيل الخروج بعض الوقت. هذا الجهاز يبقى متصلاً.|Other sessions have been signed out. Completion may take some time. This device stays signed in.
تم حفظ العملية في حسابك.|Your changes have been saved.
جاري تحميل بيانات حسابك…|Loading your account…|جارٍ تحميل بيانات حسابك…
دورني خطوة بخطوة|Dorni step by step
تعرّف على إدارة سيارتك وبطاقتك والتنبيهات.|Learn to manage your vehicle, card and alerts.
فتح سياراتي وتفعيل بطاقة|Open vehicles and activate a card
رقمك وبريدك لا يظهران في صفحة المسح. نخزن بيانات الحساب والسيارة والبلاغات لتقديم الخدمة، واشتراك الجهاز لإرسال البوش عند تفعيله.|Your phone and email are not shown on the scan page. We store account, vehicle and report data to provide the service, and your device subscription to send push notifications when enabled.
شروط الاستخدام|Terms of use
سياسة الخصوصية|Privacy policy
نُشرت:|Published:
الشروط وسياسة الخصوصية غير متاحتين حالياً. تواصل مع الدعم للاستفسار عن بياناتك.|Terms and privacy policy are not available yet. Contact support about your data.
للاستفسار عن بياناتك أو طلب حذفها، استخدم الدعم الفني أو طلب الحذف من الإعدادات. لا يوجد حذف آلي أو جدول احتفاظ معلن حالياً.|Contact support or use the deletion request in settings to ask about or request removal of your data. Automated deletion and a published retention schedule are not currently available.
صندوق دعم الفريق|Staff support inbox
تحديث|Refresh
تابع طلباتك وردود فريق الدعم هنا.|Track your requests and support replies here.
فتح تذكرة جديدة|New support ticket
تم حفظ التذكرة. تقدر تتابع حالتها وردود الفريق هنا.|Ticket saved. Follow its status and support replies here.|تم حفظ التذكرة. يمكنك متابعة حالتها وردود الفريق هنا.
التصنيف|Category
عنوان المشكلة|Subject
وصف المشكلة|Describe the issue
سيارة مرتبطة (اختياري)|Related vehicle (optional)
بدون|None
بطاقة مرتبطة (اختياري)|Related card (optional)
بلاغ مرتبط (اختياري)|Related report (optional)
حفظ التذكرة|Save ticket
لا توجد تذاكر بعد.|No support tickets yet.
رقم المتابعة:|Reference:
أنت|You
مشارك في التذكرة|Ticket participant
فريق دورني|Dorni support
• ملاحظة داخلية|• Internal note
تم حفظ الرد.|Reply saved.
رد جديد|New reply
الحالة|Status
ملاحظة داخلية لا يراها المستخدم|Internal note, hidden from the customer
إرسال الرد|Send reply
إعدادات حسابك|Account settings
بياناتك وسياراتك وأمان حسابك، في مكان واحد.|Your details, vehicles and account security in one place.
فتح ←|Open →
فتح صندوق دعم الفريق|Open staff support inbox
← كل الإعدادات|All settings →
تم حفظ اسمك.|Name saved.
الاسم الظاهر|Display name
بريد تسجيل الدخول:|Sign-in email:
لتغيير بريد تسجيل الدخول، تواصل مع الدعم.|Contact support to change your sign-in email.
حفظ الاسم|Save name
تسجيل الدخول الحالي بالبريد وكلمة المرور، وليس برقم الهاتف.|Sign in with your email and password, not your phone number.
إشعارات WhatsApp والرسائل النصية غير متاحة. يمكنك تفعيل إشعارات جهازك من إعدادات الإشعارات.|WhatsApp and SMS alerts are unavailable. Enable device notifications in notification settings.
التنبيهات داخل الحساب تبقى متاحة. تعطيل البوش يعني أنك تحتاج فتح دورني لمراجعتها.|In-app alerts remain available. If you disable push notifications, open Dorni to check them.
تثبيت دورني على التلفون|Install Dorni on your phone|تثبيت دورني على الهاتف
العربية هي لغة الواجهة الحالية.|Arabic is the current interface language.
راجع جلسات حسابك وسجّل الخروج من الأجهزة التي لا تستخدمها.|Review your sessions and sign out of devices you no longer use.
هذا الجهاز / الجلسة الحالية|This device / current session
جلسة أخرى|Another session
بدأت:|Started:
آخر تجديد:|Last refreshed:
غير متاح|Unavailable
إنهاء الجلسات الأخرى؟ ستحتاج الأجهزة الأخرى لتسجيل الدخول مجدداً. هذا الجهاز يبقى متصلاً.|Sign out other sessions? Other devices will need to sign in again. This device stays signed in.
تسجيل الخروج من الأجهزة الأخرى|Sign out other devices
تسجيل خروج هذا الجهاز متاح من القائمة. استعادة كلمة المرور متاحة من صفحة تسجيل الدخول.|Sign out of this device from the menu. Reset your password from the sign-in page.
إضافة سيارة أو تفعيل بطاقة جديدة|Add a vehicle or activate a new card
• مؤرشفة|• Archived
تعديل البيانات|Edit details
استعادة السيارة للقائمة؟|Restore this vehicle to your list?
أرشفة السيارة تحفظ تاريخها ولا تمسحه. يجب نقل البطاقة أو إلغاؤها أولاً.|Archiving keeps the vehicle history. Move or retire its card first.
استعادة|Restore
أرشفة|Archive
البطاقة موقوفة|Card paused
إيقاف رابط البطاقة مؤقتاً؟ لن يقبل بلاغات جديدة حتى إعادة التفعيل.|Pause this card? Its link will not accept new reports until resumed.
إعادة تفعيل رابط البطاقة واستقبال البلاغات؟|Resume this card and accept reports?
إيقاف مؤقت|Pause
إعادة تفعيل|Resume
نقل إلى سيارة|Move to vehicle
اختر سيارة بدون بطاقة|Choose a vehicle without a card
نقل البطاقة للسيارة المختارة؟ البلاغات الجديدة ستخص السيارة الجديدة، والسجل القديم يبقى محفوظاً.|Move the card to the selected vehicle? New reports will refer to that vehicle; previous history is retained.
نقل البطاقة|Move card
إلغاء البطاقة نهائياً؟ يتوقف رابطها ولا يمكن إعادة استخدام رمز مطالبتها. يمكنك بعدها ربط بطاقة جديدة بالسيارة.|Permanently retire this card? Its link will stop working and its activation code cannot be reused. You can then link a new card to the vehicle.
إلغاء بطاقة مفقودة / تالفة|Retire lost or damaged card
تم حفظ بيانات السيارة.|Vehicle details saved.
تعديل السيارة|Edit vehicle
اسم مختصر (اختياري)|Nickname (optional)
السنة|Year
حفظ|Save
إلغاء|Cancel
طلب حذف الحساب — مراجعة يدوية|Request account deletion — manual review
هذا يفتح طلباً محفوظاً للدعم، ولا يحذف أو يعطّل الحساب تلقائياً. الفريق يحتاج التحقق من هويتك وتحديد معالجة البيانات قبل التنفيذ.|This creates a support request. It does not automatically delete or disable the account. The team must verify your identity and decide how to handle the data before proceeding.
السيارات والبطاقات والبلاغات وتذاكر الدعم تبقى كما هي أثناء المراجعة. لإيقاف استقبال البلاغات فوراً أوقف بطاقاتك من قسم السيارات. لا يوجد موعد حذف تلقائي أو مدة احتفاظ معتمدة بعد.|Vehicles, cards, reports and tickets stay unchanged during review. Pause your cards in vehicle settings to stop new reports immediately. No automatic deletion date or approved retention period is set.
اكتب «طلب حذف» للتأكيد|Type “طلب حذف” to confirm
طلب حذف|طلب حذف
أطلب مراجعة حذف حسابي. أفهم أن هذا الطلب لا ينفذ الحذف أو التعطيل تلقائياً وأن التحقق من الهوية مطلوب قبل التنفيذ.|I request a review of account deletion. I understand this does not automatically delete or disable the account and that identity verification is required.
تأكيد إرسال طلب مراجعة الحذف؟ تقدر تتابعه وتوضح رغبتك في تذاكر الدعم. لن يتم مسح بياناتك بهذه الخطوة.|Submit a deletion review request? You can follow it in support tickets. This step does not erase your data.|هل تؤكد إرسال طلب مراجعة الحذف؟ يمكنك متابعته في تذاكر الدعم. لن تُمسح بياناتك بهذه الخطوة.
إرسال طلب مراجعة الحذف|Submit deletion review request
تأكيد العملية|Confirm action
تأكيد|Confirm
تعذر تجهيز إشعارات الجهاز. أعد فتح التطبيق وحاول مرة أخرى.|Could not prepare device notifications. Reopen the app and try again.
الإشعارات مش مسموحة. فعّلها من إعدادات الموقع أو التلفون ثم جرّب مرة أخرى.|Notifications are blocked. Enable them in your browser or phone settings, then try again.|الإشعارات غير مسموحة. فعّلها من إعدادات الموقع أو الهاتف ثم حاول مجدداً.
خدمة الإشعارات غير جاهزة حالياً.|Notifications are currently unavailable.
فعّل إشعارات هذا الجهاز أولاً.|Enable notifications on this device first.
تم إيقاف إشعارات هذا الجهاز.|Notifications disabled on this device.
تم ربط إشعارات هذا الجهاز بحسابك. اضغط اختبار للتأكد من وصولها.|This device is subscribed. Send a test notification to check delivery.
تم وضع إشعار الاختبار في طابور الإرسال. نجاح الوصول يتأكد لما تشوف إشعار الهاتف، مش بهذه الرسالة.|Test notification queued. Delivery is confirmed only when the notification appears on your phone.|أُضيف إشعار الاختبار إلى طابور الإرسال. تأكد من ظهوره على هاتفك للتحقق من وصوله.
إشعارات الجهاز|Device notifications
إشعارات التلفون|Phone notifications|إشعارات الهاتف
تنبيه على شاشة الهاتف حتى ودورني مسكّر، بعد موافقتك. إعدادات الصامت والتركيز والاتصال في تلفونك تتحكم في الصوت ووقت الظهور.|With your permission, receive alerts even when Dorni is closed. Silent mode, focus settings and connectivity affect sound and delivery time.|تلقَّ تنبيهات على الهاتف حتى عند إغلاق دورني، بعد موافقتك. إعدادات الصامت والتركيز والاتصال تؤثر في الصوت ووقت الظهور.
على الآيفون افتح دورني من أيقونته بعد إضافته للشاشة الرئيسية، واستعمل إصدار iOS يدعم Web Push. على أندرويد استخدم متصفحاً يدعم الإشعارات.|On iPhone, open Dorni from the home screen on an iOS version supporting Web Push. On Android, use a browser that supports notifications.
خدمة إشعارات الجهاز غير متاحة حالياً.|Device notifications are currently unavailable.
جاري التحقق...|Checking…|جارٍ التحقق…
إيقاف إشعارات هذا الجهاز|Disable device notifications
تفعيل إشعارات هذا الجهاز|Enable device notifications
إرسال إشعار تجريبي|Send test notification
الاشتراك خاص بهذا الجهاز وحسابك الحالي؛ تسجيل الخروج يفصله. ما تحتاجش تخلّي التطبيق مفتوح.|Subscription applies to this device and account. Signing out disconnects it. You do not need to keep the app open.|الاشتراك خاص بهذا الجهاز وحسابك الحالي، ويُفصل عند تسجيل الخروج. لا حاجة لإبقاء التطبيق مفتوحاً.
ما هو دورني؟|What is Dorni?||شن هو دورني؟
وسيلة لإبلاغ صاحب السيارة دون إظهار رقم هاتفه أو بريده للماسح. دورني ليس خدمة طوارئ ولا يضمن أن صاحب السيارة متاح للرد.|A way to alert a vehicle owner without revealing their phone or email. Dorni is not an emergency service and cannot guarantee the owner is available.
كيف أفعّل البطاقة وأربطها؟|How do I activate and link a card?
من سياراتي أضف السيارة، ثم أدخل الرقم التسلسلي ورمز المطالبة تحت طبقة الكشط واختر السيارة. احتفظ برمز المطالبة سرياً؛ رابط QR العام ليس رمز المطالبة.|In My vehicles, add your vehicle, enter the serial number and activation code under the scratch layer, then select the vehicle. Keep the activation code secret; the public QR link is not the activation code.
كيف يعمل QR وNFC؟|How do QR and NFC work?
مسح QR يفتح صفحة البلاغ. بطاقة NFC المبرمجة برابط دورني نفسه تفتح الصفحة عند تقريب هاتف يدعم NFC؛ الموقع لا يبرمج شريحة NFC تلقائياً.|Scanning QR opens the report page. An NFC card programmed with the same Dorni link opens it on a compatible phone. The website does not program NFC chips.
ماذا يرى الماسح؟|What can the scanner see?||شن يشوف اللي يمسح البطاقة؟
يرى وصف السيارة العام وأسباب البلاغ المتاحة، وليس اسم المالك أو وسائل اتصاله. بعد البلاغ يستطيع متابعة الرد برابط مؤقت.|They see the general vehicle description and report reasons, not the owner's identity or contact details. After reporting, a temporary link shows the response.
كيف أستقبل التنبيهات؟|How do I receive alerts?
افتح الإعدادات ← الإشعارات وفعّل إشعارات الجهاز وجرّبها. على الآيفون افتح التطبيق المثبت على الشاشة الرئيسية. الإذن لكل جهاز على حدة؛ إعدادات التركيز والاتصال قد تؤخر الظهور.|Open Settings → Notifications, enable device notifications and send a test. On iPhone use the installed home-screen app. Permission is per device; focus settings and connectivity may delay alerts.
فقدت البطاقة أو تلفت|My card is lost or damaged
أوقف البطاقة مؤقتاً من إدارة السيارات. إذا فقدتها نهائياً، يمكنك إلغاء البطاقة لتحرير السيارة ثم تفعيل بطاقة جديدة أصلية. الإلغاء نهائي ولا يعيد صلاحية رمز المطالبة القديم. لطلب بدل افتح تذكرة QR / NFC.|Pause the card in vehicle settings. If permanently lost, retire it and activate a new genuine card. Retirement is permanent and does not restore the old activation code. Open a QR / NFC ticket for a replacement.
كيف أغير السيارة المرتبطة؟|How do I change the linked vehicle?
من الإعدادات ← السيارات والبطاقات، اختر سيارة أخرى من حسابك لا تحمل بطاقة. النقل يحفظ سجل التعيين السابق ولا ينقل ملكية السيارة.|In Settings → Vehicles and cards, choose another vehicle in your account without a card. Moving the card preserves previous assignment history and does not transfer vehicle ownership.
الأرشفة والخصوصية|Archiving and privacy
الأرشفة تخفي السيارة من القائمة الرئيسية وتحفظ تاريخها. يلزم نقل البطاقة أو إلغاؤها أولاً. يمكنك استعادة السيارة المؤرشفة من الإعدادات.|Archiving hides a vehicle from the main list while keeping its history. Move or retire its card first. Restore archived vehicles from settings.
لماذا لا يتكرر إذن الإشعارات؟|Why does the permission prompt not appear again?
المتصفح يحفظ قرار السماح. إعادة الضغط تكمل ربط الجهاز ولا يلزم أن يظهر طلب الإذن ثانية. إذا منعته، عدّل إذن الموقع من إعدادات المتصفح.|Your browser remembers the permission choice. Pressing again can finish subscribing without another prompt. If blocked, change the site's notification permission in browser settings.
هل WhatsApp وSMS متاحان؟|Are WhatsApp and SMS available?
القنوات المفعلة حالياً هي التنبيهات داخل الحساب وWeb Push. إرسال SMS وWhatsApp وتغيير رقم موثّق يتطلب مزوّداً لم يتم تفعيله؛ لا نعرض أزرار إرسال غير عاملة.|In-app alerts and Web Push are available. SMS, WhatsApp and verified phone changes are not currently supported.
تعذر تأكيد العملية. تحقق من الاتصال وراجع بياناتك قبل إعادة المحاولة.|Could not confirm the action. Check your connection and saved data before trying again.
تعذر الاتصال بدورني. تحقق من الإنترنت وحاول مرة أخرى.|Could not connect to Dorni. Check your internet connection and try again.
انتهت الجلسة، سجّل الدخول من جديد.|Your session expired. Sign in again.
تعذر إكمال الطلب، حاول مرة أخرى.|Could not complete the request. Try again.
وصل رد غير مكتمل من الخادم. حاول تحديث البيانات.|The server returned an incomplete response. Refresh your data.
تعذر إكمال العملية، حاول مرة أخرى.|Could not complete the action. Try again.
تعذر النسخ تلقائياً. افتح الرابط وانسخه من شريط العنوان.|Could not copy automatically. Open the link and copy it from the address bar.
اكتب «{confirmation}» للتأكيد|Type “{confirmation}” to confirm
اختر لغة الواجهة|Choose interface language||اختار لغة التطبيق
يُحفظ الاختيار على هذا الجهاز.|Your choice is saved on this device.||اختيارك يقعد محفوظ في الجهاز هذا.
تعذر حفظ اللغة على هذا الجهاز.|Could not save the language on this device.||ما قدرناش نحفظوا اللغة في الجهاز هذا.
تنبيهات تحتاج ردّك: {count}|Alerts awaiting your reply: {count}|تنبيهات بانتظار ردك: {count}|تنبيهات تستنّى ردّك: {count}
بلاغات جديدة: {count}|New alerts: {count}
بطاقات فعّالة: {count}|Active cards: {count}
بلاغات مماثلة: {count}|Similar reports: {count}
BLOCKING_EXIT|Blocking my exit|السيارة تعيق الخروج|السيارة سادّة عليّ
PLEASE_MOVE|Please move the vehicle|الرجاء تحريك السيارة|بالله حرّك السيارة
LIGHTS_ON|Lights left on|الأنوار مضاءة|الأنوار شغّالة
DOOR_OR_WINDOW_OPEN|Open door or window|باب أو نافذة مفتوحة|باب أو شباك مفتوح
VEHICLE_DAMAGE|Vehicle damage|ضرر بالسيارة|ضرر في السيارة
URGENT_ATTENTION|Urgent alert|تنبيه عاجل|تنبيه عاجل
CORPORATE|Company|شركة|شركة
INSURANCE|Insurance|تأمين|تأمين
DISTRIBUTOR|Distributor|موزع|موزع
OTHER|Other|أخرى|أخرى
OWNER|Owner|مالك|مالك
ADMIN|Administrator|مدير|مدير
PARTNER_ADMIN|Partner administrator|مدير الشريك|مدير الشريك
PARTNER_OPERATOR|Partner operator|موظف الشريك|موظف الشريك
PARTNER_VIEWER|Read-only partner|شريك للعرض فقط|شريك للعرض فقط
MEMBER|Member|عضو|عضو
OPERATOR|Operator|موظف|موظف
VIEWER|Viewer|للعرض فقط|للعرض فقط
PENDING|Pending|قيد الانتظار|قيد الانتظار
ACTIVE|Active|فعّال|فعّال
SUSPENDED|Suspended|موقوف|موقوف
DELETED|Deleted|محذوف|محذوف
`;
export const ownerMessages:Record<string,{en:string;ar:string;ly:string}>=Object.fromEntries(rows.trim().split('\n').map(row=>{const [key,en,ar,ly]=row.split('|');return [key,{en,ar:ar||key,ly:ly||key}];}));
const resolvedMessages=new Map(Object.entries(ownerMessages).flatMap(([key,value])=>[key,value.en,value.ar,value.ly].map(text=>[text,value] as const)));
export function translateOwner(locale:Locale,source:string,values:Record<string,string|number>={}):string{
 const entry=resolvedMessages.get(source.trim());
 let result=entry?(locale==='en'?entry.en:locale==='ar'?entry.ar:entry.ly):source;
 for(const [key,value] of Object.entries(values))result=result.replaceAll('{'+key+'}',String(value));
 return result;
}
