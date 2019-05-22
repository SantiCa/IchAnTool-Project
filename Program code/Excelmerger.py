def ExcelMerger(root):
    import numpy as np
    import pandas as pd
    import os
    from pprint import pprint
    from tkinter import filedialog
    import tkinter as tk
    from pandas import DataFrame
    window=tk.Toplevel()
    window.title('IchnopaleoCount alfa 1.0')
    window.wm_iconbitmap("IconWindow.ico")
    window.wm_title("EM")
    window.attributes("-topmost", True)
    L1=tk.Label(window,text="Select the folder where the Workbooks wich will be merged are located",bg="gold").grid(row=0 ,column=0,columnspan=4,sticky="ew")
    ruta=filedialog.askdirectory(title='Please select a directory where Workbooks wich will be merged are located ')
    dirlist = os.listdir(ruta)
    Sheet=tk.StringVar()
    column1=tk.StringVar()
    column2=tk.StringVar()
    L2=tk.Label(window, text="Select the name of the worksheet")
    L2.grid(row=1 ,column=0 ,columnspan=3)
    Entry1=tk.Entry(window,textvariable=Sheet)
    Entry1.grid(row=1 ,column=3 )
    L3=tk.Label(window,text="Select first column")
    L3.grid(row=2 ,column=0 )
    Entry2=tk.Entry(window,textvariable=column1)
    Entry2.grid(row=2 ,column=1 )
    L4=tk.Label(window,text="Select second column")
    L4.grid(row=2 ,column=2 )
    Entry3=tk.Entry(window,textvariable=column2)
    Entry3.grid(row=2 ,column=3)

    pprint(dirlist)
    def concatenate(ruta):
        x=list()
        C1=str(Entry2.get())
        print(C1)
        C2=str(Entry3.get())
        print(C2)
        sht=str(Entry1.get())
        for d in dirlist:
            try:
                print("try for " + d)
                a=pd.read_excel(io= ruta+"/"+d, sheet_name =sht ,header=0, usecols=C1+":"+C2)
                x.append(a)
                print("success")
            except:
                print("failed")
                pass
        ca=pd.concat(x)
        pprint(ca)
        ca.to_excel(ruta+"/"+"concatenado.xlsx")
    B=tk.Button(window, text="Concatenate",bg="gold",command = lambda: concatenate(ruta))
    B.grid(row=3 ,column=3)
